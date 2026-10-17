const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const bot = new Telegraf(process.env.CLIENT_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MENU = {
  coffee: [["Эспрессо",130],["Американо",160],["Капучино",190],["Латте",200],["Флэт Уайт",210],["Раф",230],["Мокачино",240]],
  cold: [["Колд Брю",210],["Айс Латте",220],["Айс Американо",180],["Матча Латте",260],["Фраппе",250],["Лимонад",160]],
  beans: [["Арабика Эфиопия",{"250 г":450,"1 кг":1600}],["Арабика Колумбия",{"250 г":420,"1 кг":1500}],["Робуста",{"250 г":350,"1 кг":1200}],["Бленд",{"250 г":380,"1 кг":1300}],["Декаф",{"250 г":500,"1 кг":1800}]]
};

const CAT_T = { coffee: "☕ Кофе", cold: "🧊 Холодные", beans: "🫘 Зерна" };

function mainKb() {
  return {
    keyboard: [
      [{ text: "☕ Кофе" }, { text: "🧊 Холодные" }],
      [{ text: "🫘 Зерна" }, { text: "🛒 Корзина" }],
      [{ text: "📞 Контакты" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

async function getState(uid) {
  const { data } = await supabase.from('states').select('*').eq('user_id', uid).single();
  return data || { step: null, data: [] };
}

async function setState(uid, step, data) {
  await supabase.from('states').upsert({ user_id: uid, step, data });
}

async function clearState(uid) {
  await supabase.from('states').delete().eq('user_id', uid);
}

bot.start(async (ctx) => {
  const u = ctx.from;
  await supabase.from('users').upsert({ user_id: u.id, username: u.username || '', first_name: u.first_name || '' });
  const { data } = await supabase.from('users').select('banned').eq('user_id', u.id).single();
  if (data?.banned) return ctx.reply("⛔ Доступ заблокирован.");
  await clearState(u.id);
  await ctx.reply("*CoffeeBro* ☕\n\nСвежий кофе и зёрна.\nЗаказ без предоплаты.", { parse_mode: 'Markdown', reply_markup: mainKb() });
});

bot.hears("☕ Кофе", async (ctx) => sendCategory(ctx, "coffee"));
bot.hears("🧊 Холодные", async (ctx) => sendCategory(ctx, "cold"));
bot.hears("🫘 Зерна", async (ctx) => sendCategory(ctx, "beans"));
bot.hears("📞 Контакты", async (ctx) => ctx.reply("📍 г. Махачкала, ул. Шамиля 26А\n📞 +7 988 788-29-01\n🕗 08:00 – 22:00", { reply_markup: mainKb() }));
bot.hears("🛒 Корзина", async (ctx) => {
  const st = await getState(ctx.from.id);
  await ctx.reply(cartText(st.data), { parse_mode: 'Markdown', ...cartKb(st.data) });
});

async function sendCategory(ctx, cat) {
  const rows = MENU[cat].map((it, i) => {
    const price = cat === 'beans' ? Math.min(...Object.values(it[1])) : it[1];
    return [{ text: `${it[0]} — от ${price} ₽`, callback_data: `itm:${cat}:${i}` }];
  });
  await ctx.reply(`*${CAT_T[cat]}*\nВыберите позицию:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
}

function cartText(items) {
  if (!items || !items.length) return "🛒 Корзина пуста.";
  let lines = ["🛒 *Корзина:*\n"];
  let total = 0;
  items.forEach(it => { lines.push(`• ${it.name} × ${it.qty} = ${it.total} ₽`); total += it.total; });
  lines.push(`\n*Итого: ${total} ₽*`);
  return lines.join("\n");
}

function cartKb(items) {
  if (!items || !items.length) return {};
  const rows = items.map((it, i) => [{ text: `❌ ${it.name} × ${it.qty}`, callback_data: `rm:${i}` }]);
  rows.push([{ text: "✅ Оформить заказ", callback_data: "co:start" }]);
  rows.push([{ text: "🗑 Очистить", callback_data: "cart:clear" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

bot.action(/^itm:(\w+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, cat, idx] = ctx.match;
  const name = MENU[cat][idx][0];
  if (cat === 'beans') {
    const rows = Object.entries(MENU[cat][idx][1]).map(([sz, p]) => [{ text: `${sz} — ${p} ₽`, callback_data: `badd:${idx}:${sz}` }]);
    await ctx.editMessageText(`*${name}*\nВыберите фасовку:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
  } else {
    const price = MENU[cat][idx][1];
    const rows = [1,2,3,5,10].map(n => [{ text: `${n} шт — ${n*price} ₽`, callback_data: `qadd:${cat}:${idx}:${n}` }]);
    await ctx.editMessageText(`*${name}*\n${price} ₽ / шт. Сколько?`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
  }
});

bot.action(/^qadd:(\w+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, cat, idx, n] = ctx.match;
  const name = MENU[cat][idx][0], price = MENU[cat][idx][1];
  const st = await getState(ctx.from.id);
  st.data.push({ name, qty: parseInt(n), price, total: price * parseInt(n) });
  await setState(ctx.from.id, st.step, st.data);
  await ctx.editMessageText(`✅ *${name}* × ${n} добавлено\n\nИтого: *${st.data.reduce((a, b) => a + b.total, 0)} ₽*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Корзина", callback_data: "cart:show" }]] } });
});

bot.action(/^badd:(\d+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, idx, sz] = ctx.match;
  const name = MENU.beans[idx][0], price = MENU.beans[idx][1][sz];
  const st = await getState(ctx.from.id);
  st.data.push({ name: `${name} (${sz})`, qty: 1, price, total: price });
  await setState(ctx.from.id, st.step, st.data);
  await ctx.editMessageText(`✅ *${name}* (${sz}) добавлено\n\nИтого: *${st.data.reduce((a, b) => a + b.total, 0)} ₽*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Корзина", callback_data: "cart:show" }]] } });
});

bot.action("cart:show", async (ctx) => {
  await ctx.answerCbQuery();
  const st = await getState(ctx.from.id);
  await ctx.editMessageText(cartText(st.data), { parse_mode: 'Markdown', ...cartKb(st.data) });
});

bot.action("cart:clear", async (ctx) => {
  await ctx.answerCbQuery();
  await setState(ctx.from.id, null, []);
  await ctx.editMessageText("🗑 Корзина очищена.");
});

bot.action(/^rm:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const st = await getState(ctx.from.id);
  st.data.splice(parseInt(ctx.match[1]), 1);
  await setState(ctx.from.id, st.step, st.data);
  await ctx.editMessageText(cartText(st.data), { parse_mode: 'Markdown', ...cartKb(st.data) });
});

bot.action("co:start", async (ctx) => {
  await ctx.answerCbQuery();
  const st = await getState(ctx.from.id);
  if (!st.data.length) return ctx.answerCbQuery("Корзина пуста", { show_alert: true });
  await setState(ctx.from.id, 'name', st.data);
  await ctx.editMessageText("📝 *Шаг 1/4.* Введите ваше имя:", { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
  const st = await getState(ctx.from.id);
  if (!st.step) return;
  const txt = ctx.message.text;
  if (txt === 'отмена') { await clearState(ctx.from.id); return ctx.reply("Отменено.", { reply_markup: mainKb() }); }
  if (st.step === 'name') { await setState(ctx.from.id, 'phone', st.data); await ctx.reply("📞 *Шаг 2/4.* Введите телефон:", { parse_mode: 'Markdown' }); }
  else if (st.step === 'phone') { st.data.phone = txt; await setState(ctx.from.id, 'address', st.data); await ctx.reply("📍 *Шаг 3/4.* Адрес доставки или «самовывоз»:", { parse_mode: 'Markdown' }); }
  else if (st.step === 'address') { st.data.address = txt; await setState(ctx.from.id, 'comment', st.data); await ctx.reply("💬 *Шаг 4/4.* Комментарий или «-»:", { parse_mode: 'Markdown' }); }
  else if (st.step === 'comment') {
    st.data.comment = txt;
    const total = st.data.reduce((a, b) => a + b.total, 0);
    const itemsStr = st.data.map(i => `• ${i.name} × ${i.qty} = ${i.total} ₽`).join("\n");
    const { data: order } = await supabase.from('orders').insert({ user_id: ctx.from.id, username: ctx.from.username || '', name: st.data.name || st.data[0]?.name, phone: st.data.phone, address: st.data.address, comment: st.data.comment, items: st.data, total }).select().single();
    
    await clearState(ctx.from.id);
    await ctx.reply(`✅ *Заказ #${order.id} принят!*\nОплата при получении.`, { parse_mode: 'Markdown', reply_markup: mainKb() });

    const adminBot = new Telegraf(process.env.ADMIN_BOT_TOKEN);
    const { data: adminUser } = await supabase.from('users').select('user_id').eq('is_admin', true).single();
    if (adminUser) {
      await adminBot.telegram.sendMessage(adminUser.user_id, `🆕 *Заказ #${order.id}*\n👤 ${st.data.name || ctx.from.first_name}\n📞 ${st.data.phone}\n📍 ${st.data.address}\n\n${itemsStr}\n💰 *Итого: ${total} ₽*`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "✅ Принять", callback_data: `ord:ok:${order.id}` }, { text: "❌ Отменить", callback_data: `ord:no:${order.id}` }]] }
      });
    }
  }
});

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    await bot.handleUpdate(body);
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: 'error' };
  }
};
