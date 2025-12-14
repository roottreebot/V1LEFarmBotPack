// === V1LE FARM BOT FULL WORKING VERSION FOR TERMUX ===
const TelegramBot = require('node-telegram-bot-api');

// Load environment variables
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN) {
  console.error('❌ BOT_TOKEN not set in environment!');
  process.exit(1);
}

// Polling bot
const bot = new TelegramBot(TOKEN, { polling: { interval: 100, timeout: 10 } });

// In-memory user storage
const users = new Map(); // userId -> { level, exp, orders }
const XP_PER_MESSAGE = 1;
const XP_TO_LEVEL_UP = 100;

// --- Helpers ---
const deleteMessage = (chatId, messageId, delay = 2000) => {
  setTimeout(() => bot.deleteMessage(chatId, messageId).catch(() => {}), delay);
};

const sendTempMessage = async (chatId, text, delay = 5000, parse_mode = 'HTML') => {
  const msg = await bot.sendMessage(chatId, text, { parse_mode });
  deleteMessage(chatId, msg.message_id, delay);
  return msg;
};

const getLeaderboard = () => {
  const arr = Array.from(users.entries())
    .sort((a, b) => b[1].level - a[1].level || b[1].exp - a[1].exp)
    .slice(0, 10);
  let text = '🏆 <b>Top 10 Users</b>\n\n';
  arr.forEach(([id, u], i) => {
    text += `${i + 1}. User ${id} - Level ${u.level} (${u.exp} XP)\n`;
  });
  return text;
};

const getRecipeMenu = () => `
╔═════════════════╗
║   V1LE FARM 🍀   ║
╠═════════════════╣
║ $1   -> Item A  ║
║ $5   -> Item B  ║
║ $10  -> Item C ║
║ $50  -> Item D ║
╠═════════════════╣
║ Use $<amount>   ║
║ to place order! ║
╚═════════════════╝
`;

// --- Message Handlers ---
// XP / leveling
bot.on('message', (msg) => {
  const userId = msg.from.id;
  if (msg.from.is_bot) return;

  if (!users.has(userId)) users.set(userId, { level: 1, exp: 0, orders: [] });
  const user = users.get(userId);

  user.exp += XP_PER_MESSAGE;
  if (user.exp >= XP_TO_LEVEL_UP) {
    user.level += 1;
    user.exp = 0;
    sendTempMessage(msg.chat.id, `🎉 Congrats <b>${msg.from.first_name}</b>, you reached level ${user.level}!`);
  }
});

// --- Commands ---
// $<amount> input
bot.onText(/^\$(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!users.has(userId)) users.set(userId, { level: 1, exp: 0, orders: [] });
  const user = users.get(userId);

  const value = parseInt(match[1]);
  if (!value) {
    await sendTempMessage(chatId, '❌ Invalid input. Enter a number after $');
  } else {
    user.orders.push({ value, date: new Date() });
    await sendTempMessage(chatId, `✅ Order received: $${value}`);
  }

  deleteMessage(chatId, msg.message_id, 2000);
});

// !leaderboard
bot.onText(/!leaderboard/i, async (msg) => {
  await sendTempMessage(msg.chat.id, getLeaderboard(), 10000);
  deleteMessage(msg.chat.id, msg.message_id, 2000);
});

// !menu
bot.onText(/!menu/i, async (msg) => {
  await sendTempMessage(msg.chat.id, getRecipeMenu(), 10000);
  deleteMessage(msg.chat.id, msg.message_id, 2000);
});

// /broadcast <text>
bot.onText(/\/broadcast (.+)/i, async (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  const text = match[1];
  for (const [uid] of users) {
    await sendTempMessage(uid, `📢 Admin broadcast:\n${text}`);
  }
  deleteMessage(msg.chat.id, msg.message_id, 2000);
});

// /clear_orders
bot.onText(/\/clear_orders/i, async (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;
  users.forEach(u => (u.orders = []));
  for (const [uid] of users) {
    await sendTempMessage(uid, '🗑️ All orders cleared by admin');
  }
  deleteMessage(msg.chat.id, msg.message_id, 2000);
});

// --- Error Handling ---
bot.on('polling_error', (err) => console.error('Polling error:', err));
bot.on('error', (err) => console.error('Bot error:', err));

console.log('✅ V1LE FARM BOT FULL WORKING VERSION is running...');
