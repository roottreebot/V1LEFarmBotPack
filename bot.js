// === V1LE FARM BOT — FINAL STABLE BUILD ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(Number);

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { weeklyReset: Date.now(), storeOpen: true, totalMoney: 0, totalOrders: 0 };

meta.totalMoney = Number(meta.totalMoney) || 0;
meta.totalOrders = Number(meta.totalOrders) || 0;

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ================= USERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false,
      username: username || ''
    };
  }
  if (username) users[id].username = username;
}

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= SESSIONS =================
const sessions = {};

// ================= XP =================
function giveXP(id, xp) {
  users[id].xp += xp;
  users[id].weeklyXp += xp;
  while (users[id].xp >= users[id].level * 5) {
    users[id].xp -= users[id].level * 5;
    users[id].level++;
  }
}

// ================= STATS MESSAGE =================
function statsText() {
  return `💰 Total Money Earned: $${meta.totalMoney.toFixed(2)}
📦 Total Orders: ${meta.totalOrders}`;
}

// ================= /STATS =================
bot.onText(/\/stats/, msg => {
  const id = msg.chat.id;

  const buttons = [
    [{ text: '🔄 Refresh', callback_data: 'stats_refresh' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    buttons.push(
      [
        { text: '♻ Reset Money', callback_data: 'reset_money' },
        { text: '♻ Reset Orders', callback_data: 'reset_orders' }
      ],
      [{ text: '♻ Reset Both', callback_data: 'reset_both' }]
    );
  }

  bot.sendMessage(id, statsText(), {
    reply_markup: { inline_keyboard: buttons }
  });
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  await bot.answerCallbackQuery(q.id).catch(() => {});

  // ---- STATS ----
  if (q.data === 'stats_refresh') {
    return bot.editMessageText(statsText(), {
      chat_id: id,
      message_id: q.message.message_id,
      reply_markup: q.message.reply_markup
    });
  }

  if (!ADMIN_IDS.includes(id)) return;

  if (q.data === 'reset_money') {
    meta.totalMoney = 0;
    saveAll();
  }
  if (q.data === 'reset_orders') {
    meta.totalOrders = 0;
    saveAll();
  }
  if (q.data === 'reset_both') {
    meta.totalMoney = 0;
    meta.totalOrders = 0;
    saveAll();
  }

  if (q.data.startsWith('reset_')) {
    return bot.editMessageText(statsText(), {
      chat_id: id,
      message_id: q.message.message_id,
      reply_markup: q.message.reply_markup
    });
  }
});

// ================= ORDER ACCEPT (FIXED COUNTERS) =================
function acceptOrder(userId, order) {
  order.cash = Number(order.cash); // 🔴 critical fix

  meta.totalMoney += order.cash;
  meta.totalOrders += 1;

  giveXP(userId, Math.floor(order.cash / 2));
  saveAll();
}

// ================= ADMIN ORDER ACTION =================
bot.on('callback_query', q => {
  if (!q.data.startsWith('admin_')) return;

  const [, action, uid, idx] = q.data.split('_');
  const userId = Number(uid);
  const order = users[userId]?.orders[idx];
  if (!order || order.status !== 'Pending') return;

  if (action === 'accept') {
    order.status = '✅ Accepted';
    acceptOrder(userId, order);
  } else {
    order.status = '❌ Rejected';
  }

  saveAll();

  for (const { admin, msgId } of order.adminMsgs) {
    bot.editMessageText(
      `🧾 ORDER UPDATE
User: @${users[userId].username || userId}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}
Status: ${order.status}`,
      { chat_id: admin, message_id: msgId }
    ).catch(() => {});
  }
});
