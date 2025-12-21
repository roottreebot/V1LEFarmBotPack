// === V1LE FARM BOT (FINAL – FIXED & STABLE) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ================= ENV =================
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

// ================= SAFE SAVE =================
function safeSave(file, data) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function load(file, def) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : def;
}

let users = load(DB_FILE, {});
let meta = load(META_FILE, { weeklyReset: Date.now(), storeOpen: true });

function saveAll() {
  safeSave(DB_FILE, users);
  safeSave(META_FILE, meta);
}

// ================= SHUTDOWN =================
process.on('SIGINT', () => { saveAll(); process.exit(); });
process.on('SIGTERM', () => { saveAll(); process.exit(); });

// ================= USERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false,
      username: username || '',
      lastOrderAt: 0,
      rejectedStreak: 0
    };
  }
  if (username) users[id].username = username;
}

// ================= XP =================
function giveXP(id, xp) {
  const u = users[id];
  if (!u || u.banned) return;
  u.xp += xp;
  u.weeklyXp += xp;
  while (u.xp >= u.level * 5) {
    u.xp -= u.level * 5;
    u.level++;
  }
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.floor((xp / max) * 10);
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= TIME =================
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= ASCII =================
const ASCII_MAIN = `╔═════════╗
║ V1LE FARM
╚═════════╝`;

const ASCII_LB = `╔════════════╗
║ LEADERBOARD
╚════════════╝`;

// ================= SESSIONS =================
const sessions = {};

// ================= SEND OR EDIT (FIXED) =================
async function sendOrEdit(id, text, opt = {}) {
  if (!sessions[id]) sessions[id] = {};
  const s = sessions[id];

  // Delete old menus
  if (s.menuIds?.length > 1) {
    for (const mid of s.menuIds.slice(0, -1)) {
      bot.deleteMessage(id, mid).catch(() => {});
    }
    s.menuIds = s.menuIds.slice(-1);
  }

  if (s.menuIds?.length === 1) {
    try {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: s.menuIds[0],
        ...opt
      });
      return;
    } catch {}
  }

  const m = await bot.sendMessage(id, text, opt);
  s.menuIds = (s.menuIds || []).concat(m.message_id);
}

// ================= LEADERBOARD =================
function getLeaderboard(page = 0) {
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const slice = list.slice(page * 10, page * 10 + 10);
  let text = `${ASCII_LB}\n🏆 Weekly Top Farmers\n\n`;

  slice.forEach(([id, u], i) => {
    text += `#${page * 10 + i + 1} @${u.username || id} — Lv${u.level} — ${u.weeklyXp}XP\n`;
  });

  return {
    text,
    buttons: [[
      { text: '⬅ Prev', callback_data: `lb_${page - 1}` },
      { text: '➡ Next', callback_data: `lb_${page + 1}` }
    ]]
  };
}

// ================= MAIN MENU =================
async function showMainMenu(id, page = 0) {
  ensureUser(id);
  const u = users[id];

  const orders = u.orders.length
    ? u.orders.map(o =>
        `${o.status} ${o.product} — ${o.grams}g — $${o.cash}\n⏱ ${timeAgo(o.createdAt)}`
      ).join('\n\n')
    : '_No orders yet_';

  const lb = getLeaderboard(page);

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    ...lb.buttons,
    [{ text: '🔄 Reload Menu', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([{ text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store', callback_data: meta.storeOpen ? 'store_close' : 'store_open' }]);
  }

  await sendOrEdit(id,
`${ASCII_MAIN}
${meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}
⏱ Orders reviewed within 1–2 hours

🎚 Level ${u.level}
📊 ${xpBar(u.xp, u.level)}

📦 Orders (last 10)
${orders}

${lb.text}`,
{ parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
}

// ================= START =================
bot.onText(/\/start|\/help/, m => showMainMenu(m.chat.id));

// ================= CALLBACKS (SINGLE HANDLER – FIXED) =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const s = sessions[id] ||= {};
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (q.data === 'reload') return showMainMenu(id);

  if (q.data.startsWith('lb_'))
    return showMainMenu(id, Math.max(0, Number(q.data.split('_')[1])));

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll();
    return showMainMenu(id);
  }

  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll();
    return showMainMenu(id);
  }

  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen)
      return bot.answerCallbackQuery(q.id, { text: 'Store closed', show_alert: true });

    s.product = q.data.replace('product_', '');
    s.step = 'amount';
    s.locked = false;
    return sendOrEdit(id, `${ASCII_MAIN}\n✏️ Send grams or $ amount`);
  }

  if (q.data === 'confirm') {
    if (s.locked) return;
    s.locked = true;

    const u = users[id];
    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: '⏳ Pending',
      createdAt: Date.now(),
      pendingXP: Math.floor(2 + s.cash * 0.5),
      adminMsgs: []
    };

    u.orders.push(order);
    u.orders = u.orders.slice(-10);
    saveAll();

    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(
        admin,
        `🧾 NEW ORDER\n@${u.username || id}\n${order.product} — ${order.grams}g — $${order.cash}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Accept', callback_data: `admin_accept_${id}_${u.orders.length - 1}` },
              { text: '❌ Reject', callback_data: `admin_reject_${id}_${u.orders.length - 1}` }
            ]]
          }
        }
      );
      order.adminMsgs.push({ admin, msgId: m.message_id });
    }

    delete sessions[id];
    saveAll();
    return showMainMenu(id);
  }

  if (q.data.startsWith('admin_')) {
    const [, action, uid, index] = q.data.split('_');
    const userId = Number(uid);
    const order = users[userId]?.orders[index];
    if (!order || order.status !== '⏳ Pending') return;

    order.status = action === 'accept' ? '🟢 Accepted' : '❌ Rejected';

    if (action === 'accept') giveXP(userId, order.pendingXP);

    for (const { admin, msgId } of order.adminMsgs) {
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: admin, message_id: msgId }).catch(() => {});
      setTimeout(() => bot.deleteMessage(admin, msgId).catch(() => {}), 600000);
    }

    saveAll();
    return showMainMenu(userId);
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  if (!msg.from.is_bot)
    setTimeout(() => bot.deleteMessage(id, msg.message_id).catch(() => {}), 2000);

  const s = sessions[id];
  if (!s || s.step !== 'amount') return;

  const price = PRODUCTS[s.product].price;
  let grams, cash;

  if (msg.text.startsWith('$')) {
    cash = parseFloat(msg.text.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(parseFloat(msg.text) * 2) / 2;
    cash = +(grams * price).toFixed(2);
  }

  if (!grams || grams < 2) return;

  s.grams = grams;
  s.cash = cash;

  sendOrEdit(id,
`${ASCII_MAIN}
🧾 Order Summary
🌿 ${s.product}
⚖️ ${grams}g
💲 $${cash}`,
{
  reply_markup: {
    inline_keyboard: [
      [{ text: '✅ Confirm', callback_data: 'confirm' }],
      [{ text: '🏠 Back', callback_data: 'reload' }]
    ]
  }
});
});
