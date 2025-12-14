// === V1LE FARM BOT ===
// FINAL BUILD — Sales Stats + CSV Export Included

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ================= ENV =================
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ Bot running');

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';
const SESS_FILE = 'sessions.json';
const EXPORT_FILE = 'orders_export.csv';

// ================= LOAD =================
let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { weeklyReset: Date.now() };
let sessions = fs.existsSync(SESS_FILE)
  ? JSON.parse(fs.readFileSync(SESS_FILE))
  : {};

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  fs.writeFileSync(SESS_FILE, JSON.stringify(sessions, null, 2));
}

// ================= HELPERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false,
      username: username || '',
      role: 'USER'
    };
  }
  if (username) users[id].username = username;
}

function isAdmin(id) {
  return ADMIN_IDS.includes(id);
}

function banGuard(id) {
  ensureUser(id);
  if (users[id].banned) {
    bot.sendMessage(id, '🚫 You are banned.');
    return true;
  }
  return false;
}

function newOrderId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ================= CONFIG =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

const MAX_PENDING = 3;
const ORDER_EXPIRE_MS = 48 * 60 * 60 * 1000;

// ================= XP =================
function addXP(id, xp) {
  users[id].xp += xp;
  users[id].weeklyXp += xp;
  while (users[id].xp >= users[id].level * 5) {
    users[id].xp -= users[id].level * 5;
    users[id].level++;
  }
  saveAll();
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.floor((xp / max) * 10);
  return '🟥'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= ASCII =================
const HEADER = `
\`\`\`
█████▄   ▄██▄   ▄██▄ ██████
██▄▄██▄ ██  ██ ██  ██  ██
██   ██    ▀██▀   ▀██▀   ██
        V 1 L E   F A R M
\`\`\`
`;

// ================= UI =================
async function sendOrEdit(id, text, opt = {}) {
  if (!sessions[id]) sessions[id] = {};
  const mid = sessions[id].mainMsgId;

  if (mid) {
    try {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: mid,
        ...opt
      });
      return;
    } catch {}
  }

  const m = await bot.sendMessage(id, text, opt);
  sessions[id].mainMsgId = m.message_id;
  saveAll();
}

// ================= DELETE USER MSG =================
bot.on('message', msg => {
  if (!msg.from.is_bot) {
    setTimeout(() => {
      bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
    }, 3000);
  }
});

// ================= AUTO EXPIRE =================
setInterval(() => {
  for (const uid in users) {
    users[uid].orders.forEach(o => {
      if (o.status === 'Pending' && Date.now() - o.time > ORDER_EXPIRE_MS) {
        o.status = '⌛ Expired';
      }
    });
  }
  saveAll();
}, 10 * 60 * 1000);

// ================= MAIN MENU =================
async function showMainMenu(id) {
  ensureUser(id);
  sessions[id].step = null;

  const kb = Object.keys(PRODUCTS).map(p => [
    { text: `🌿 ${p}`, callback_data: `product_${p}` }
  ]);

  const pending = users[id].orders.filter(o => o.status === 'Pending');
  const list = pending.length
    ? pending.map(o => `#${o.id} • ${o.product} • ${o.grams}g • $${o.cash}`).join('\n') + '\n\n'
    : '';

  await sendOrEdit(
    id,
    `${HEADER}
🎚 Level: *${users[id].level}*
📊 XP: ${xpBar(users[id].xp, users[id].level)}

${list}🛒 Select product 👇`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );
}

// ================= START =================
bot.onText(/\/start|\/help/, msg => {
  if (banGuard(msg.chat.id)) return;
  showMainMenu(msg.chat.id);
});

// ================= ADMIN SALES =================
bot.onText(/\/sales/, msg => {
  if (!isAdmin(msg.chat.id)) return;

  let total = 0,
    accepted = 0,
    rejected = 0,
    pending = 0,
    expired = 0,
    revenue = 0,
    todayRevenue = 0;

  const today = new Date().toDateString();
  const productCount = {};

  for (const uid in users) {
    users[uid].orders.forEach(o => {
      total++;
      if (o.status === '✅ Accepted') {
        accepted++;
        revenue += o.cash;
        if (new Date(o.time).toDateString() === today) {
          todayRevenue += o.cash;
        }
        productCount[o.product] = (productCount[o.product] || 0) + 1;
      }
      if (o.status === '❌ Rejected') rejected++;
      if (o.status === 'Pending') pending++;
      if (o.status === '⌛ Expired') expired++;
    });
  }

  const topProduct =
    Object.entries(productCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  bot.sendMessage(
    msg.chat.id,
    `📊 *Sales Stats*

🧾 Total Orders: ${total}
✅ Accepted: ${accepted}
❌ Rejected: ${rejected}
⏳ Pending: ${pending}
⌛ Expired: ${expired}

💰 Total Revenue: $${revenue.toFixed(2)}
📅 Today: $${todayRevenue.toFixed(2)}

🌿 Top Product: ${topProduct}`,
    { parse_mode: 'Markdown' }
  );
});

// ================= CSV EXPORT =================
bot.onText(/\/export/, msg => {
  if (!isAdmin(msg.chat.id)) return;

  let csv = 'OrderID,UserID,Username,Product,Grams,Price,Status,Timestamp\n';

  for (const uid in users) {
    const uname = users[uid].username || '';
    users[uid].orders.forEach(o => {
      csv += `${o.id},${uid},${uname},${o.product},${o.grams},${o.cash},${o.status},${new Date(o.time).toISOString()}\n`;
    });
  }

  fs.writeFileSync(EXPORT_FILE, csv);

  bot.sendDocument(msg.chat.id, path.resolve(EXPORT_FILE), {
    caption: '📎 Orders CSV Export'
  });
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;
  ensureUser(id, q.from.username);

  if (data.startsWith('product_')) {
    if (users[id].orders.filter(o => o.status === 'Pending').length >= MAX_PENDING) {
      return sendOrEdit(id, '⚠️ You already have 3 pending orders.');
    }
    sessions[id].product = data.replace('product_', '');
    sessions[id].step = 'amount';
    saveAll();
    return sendOrEdit(id, `${HEADER}✏️ Send grams or $ amount`, { parse_mode: 'Markdown' });
  }

  if (data === 'confirm_order') {
    const s = sessions[id];
    const order = {
      id: newOrderId(),
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: 'Pending',
      time: Date.now()
    };
    users[id].orders.push(order);
    addXP(id, 2);
    saveAll();
    return showMainMenu(id);
  }

  if (data.startsWith('admin_accept_')) {
    const [, , uid, oid] = data.split('_');
    const order = users[uid].orders.find(o => o.id === oid);
    if (!order || order.status !== 'Pending') return;
    order.status = '✅ Accepted';
    saveAll();
    bot.sendMessage(uid, `✅ Order #${oid} accepted`);
    showMainMenu(uid);
  }

  if (data.startsWith('admin_reject_confirm_')) {
    const [, , , uid, oid] = data.split('_');
    return bot.sendMessage(id, `❌ Reject order #${oid}?`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'YES – Reject', callback_data: `admin_reject_${uid}_${oid}` }],
          [{ text: 'Cancel', callback_data: 'cancel' }]
        ]
      }
    });
  }

  if (data.startsWith('admin_reject_')) {
    const [, , uid, oid] = data.split('_');
    const order = users[uid].orders.find(o => o.id === oid);
    if (!order || order.status !== 'Pending') return;
    order.status = '❌ Rejected';
    saveAll();
    bot.sendMessage(uid, `❌ Order #${oid} rejected`);
    showMainMenu(uid);
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  if (!sessions[id] || sessions[id].step !== 'amount') return;

  const price = PRODUCTS[sessions[id].product].price;
  const t = msg.text.trim();

  let grams, cash;
  if (t.startsWith('$')) {
    cash = parseFloat(t.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(parseFloat(t) * 2) / 2;
    cash = +(grams * price).toFixed(2);
  }

  if (!grams || grams < 2) return sendOrEdit(id, '❌ Minimum 2g');

  sessions[id].grams = grams;
  sessions[id].cash = cash;
  sessions[id].step = 'confirm';
  saveAll();

  sendOrEdit(
    id,
    `${HEADER}
🧾 *Confirm Order*
🌿 ${sessions[id].product}
⚖️ ${grams}g
💲 $${cash}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Confirm Order', callback_data: 'confirm_order' }],
          [{ text: '🏠 Cancel', callback_data: 'cancel' }]
        ]
      }
    }
  );
});
