const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const bot = new Telegraf(process.env.ADMIN_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

bot.on('text', async (ctx) => {
  if (ctx.message.text === 'snegr') {
    const { data: admin } = await supabase.from('users').select('*').eq('is_admin', true).single();
    if (!admin) {
      await supabase.from('users').upsert({ user_id: ctx.from.id, username: ctx.from.username || '', first_name: ctx.from.first_name || '', is_admin: true });
    } else if (admin.user_id !== ctx.from.id) {
      return;
    }
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply("🔐 *Админ-панель CoffeeBro*", {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📦 Последние заказы", callback_data: "adm:orders" }],
          [{ text: "👥 Пользователи", callback_data: "adm:users" }]
        ]
      }
    });
  }
});

bot.action("adm:orders", async (ctx) => {
  await ctx.answerCbQuery();
  const { data } = await supabase.from('orders').select('*').order('id', { ascending: false }).limit(10);
  if (!data || !data.length) return ctx.editMessageText("Заказов нет.", { reply_markup: { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "adm:panel" }]] } });
  const lines = data.map(o => `#${o.id} — ${o.total} ₽ — ${o.status}`);
  await ctx.editMessageText(lines.join("\n"), { reply_markup: { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "adm:panel" }]] } });
});

bot.action(/^ord:(ok|no):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, action, id] = ctx.match;
  await supabase.from('orders').update({ status: action === 'ok' ? 'accepted' : 'cancelled' }).eq('id', parseInt(id));
  await ctx.editMessageText(`Заказ #${id} ${action === 'ok' ? 'принят ✅' : 'отменён ❌'}`);
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
