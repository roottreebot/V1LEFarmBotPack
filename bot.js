// === V1LE FARM BOT (FINAL – FULL FEATURES + ADMIN SUITE) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ BOT_TOKEN or ADMIN_IDS missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { weeklyReset: Date.now(), storeOpen: true };

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
      username: username || '',
      lastSeen: Date.now()
    };
  }
  users[id].lastSeen = Date.now();
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

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= SESSIONS =================
const sessions = {};

// ================= CLEANUP =================
function cleanupOrders(id) {
  const u = users[id];
  if (!u) return;
  u.orders = u.orders.filter(o => o.status !== '❌ Rejected');
  if (u.orders.length > 5) u.orders = u.orders.slice(-5);
}

// ================= WEEKLY RESET =================
setInterval(() => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - meta.weeklyReset >= WEEK) {
    Object.values(users).forEach(u => (u.weeklyXp = 0));
    meta.weeklyReset = Date.now();
    saveAll();
  }
}, 3600000);

// ================= LEADERBOARD =================
function getLeaderboard(page = 0) {
  const lbSize = 5;
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const totalPages = Math.ceil(list.length / lbSize) || 1;
  const slice = list.slice(page * lbSize, page * lbSize + lbSize);

  let text = `*📊 Weekly Leaderboard*\n\n`;
  slice.forEach(([id, u], i) => {
    text += `#${page * lbSize + i + 1} — *@${u.username || id}* — Lv *${u.level}* — XP *${u.weeklyXp}*\n`;
  });

  const buttons = [[
    { text: '⬅ Prev', callback_data: `lb_${page - 1}` },
    { text: '➡ Next', callback_data: `lb_${page + 1}` }
  ]];

  return { text, buttons };
}

// ================= SEND/EDIT MAIN MENU =================
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
    } catch {
      sessions[id].mainMsgId = null;
    }
  }

  const m = await bot.sendMessage(id, text, opt);
  sessions[id].mainMsgId = m.message_id;
}

// ================= MAIN MENU =================
async function showMainMenu(id, lbPage = 0) {
  ensureUser(id);
  cleanupOrders(id);

  const u = users[id];
  const orders = u.orders.length
    ? u.orders.map(o =>
        `${o.status === '✅ Accepted' ? '🟢' : '⚪'} *${o.product}* — ${o.grams}g — $${o.cash} — *${o.status}*`
      ).join('\n')
    : '_No orders yet_';

  const lb = getLeaderboard(lbPage);

  let kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    lb.buttons[0],
    [{ text: '🔄 Reload Menu', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    const storeBtn = meta.storeOpen
      ? { text: '🔴 Close Store', callback_data: 'store_close' }
      : { text: '🟢 Open Store', callback_data: 'store_open' };
    kb.push([storeBtn]);
  }

  const storeStatus = meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed';

  await sendOrEdit(
    id,
`${storeStatus}
🎚 Level: *${u.level}*
📊 XP: ${xpBar(u.xp, u.level)}

📦 *Your Orders* (last 5)
${orders}

${lb.text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );
}

// ================= START =================
bot.onText(/\/start|\/help/, msg => {
  showMainMenu(msg.chat.id, 0);
});

// ================= STATS (ADMIN ONLY) =================
bot.onText(/\/stats/, msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;

  let totalUsers = Object.keys(users).length;
  let banned = 0, active = 0;
  let totalOrders = 0, pending = 0, accepted = 0, money = 0;

  const ACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

  for (const u of Object.values(users)) {
    if (u.banned) banned++;
    if (Date.now() - u.lastSeen < ACTIVE_MS) active++;

    for (const o of u.orders) {
      totalOrders++;
      if (o.status === 'Pending') pending++;
      if (o.status === '✅ Accepted') {
        accepted++;
        money += o.cash;
      }
    }
  }

  bot.sendMessage(
    id,
`📊 *BOT STATS*

👥 Users: *${totalUsers}*
🟢 Active (7d): *${active}*
🚫 Banned: *${banned}*

📦 Orders: *${totalOrders}*
⏳ Pending: *${pending}*
✅ Accepted: *${accepted}*

💰 Total Earned: *$${money.toFixed(2)}*
🏪 Store: *${meta.storeOpen ? 'OPEN' : 'CLOSED'}*`,
    { parse_mode: 'Markdown' }
  );
});

// ================= BROADCAST TEXT =================
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  sessions[msg.chat.id] = { type: 'text', text: match[1] };
  bot.sendMessage(
    msg.chat.id,
`📣 *Broadcast Preview*

${match[1]}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Send All', callback_data: 'bc_send_all' }],
          [{ text: '🎯 Send Active Only', callback_data: 'bc_send_active' }],
          [{ text: '❌ Cancel', callback_data: 'bc_cancel' }]
        ]
      }
    }
  );
});

// ================= BROADCAST PHOTO =================
bot.onText(/\/broadcastphoto/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  sessions[msg.chat.id] = { type: 'photo', step: 'wait_photo' };
  bot.sendMessage(msg.chat.id, '🖼 Send photo now');
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const s = sessions[id];
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (!s) return;

  if (q.data === 'bc_cancel') {
    delete sessions[id];
    return bot.sendMessage(id, '❌ Broadcast cancelled');
  }

  if (q.data.startsWith('bc_send')) {
    let onlyActive = q.data === 'bc_send_active';
    let sent = 0, failed = 0;
    const ACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

    for (const uid of Object.keys(users)) {
      const u = users[uid];
      if (u.banned) continue;
      if (onlyActive && Date.now() - u.lastSeen > ACTIVE_MS) continue;

      try {
        if (s.type === 'photo' && s.photo) {
          await bot.sendPhoto(uid, s.photo, { caption: s.text || '', parse_mode: 'Markdown' });
        } else {
          await bot.sendMessage(uid, s.text || '', { parse_mode: 'Markdown' });
        }
        sent++;
      } catch {
        failed++;
      }

      await new Promise(r => setTimeout(r, 35));
    }

    bot.sendMessage(
      id,
      `✅ *Broadcast Finished*\n\n📬 Sent: *${sent}*\n❌ Failed: *${failed}*`,
      { parse_mode: 'Markdown' }
    );
    delete sessions[id];
  }
});

// ================= PHOTO INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  const s = sessions[id];
  if (!s || s.type !== 'photo') return;

  if (s.step === 'wait_photo' && msg.photo) {
    s.photo = msg.photo[msg.photo.length - 1].file_id;
    s.step = 'wait_caption';
    return bot.sendMessage(id, '✏️ Send caption text (or type `skip`)');
  }

  if (s.step === 'wait_caption' && msg.text) {
    s.text = msg.text.toLowerCase() === 'skip' ? '' : msg.text;

    bot.sendMessage(
      id,
      '📣 *Broadcast Preview*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Send All', callback_data: 'bc_send_all' }],
            [{ text: '🎯 Send Active Only', callback_data: 'bc_send_active' }],
            [{ text: '❌ Cancel', callback_data: 'bc_cancel' }]
          ]
        }
      }
    );
  }
});
