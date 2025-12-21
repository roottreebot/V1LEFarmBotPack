// === V1LE FARM BOT (FINAL FULL FEATURED + STABLE) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(Number);

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { storeOpen: true, weeklyReset: Date.now() };

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ================= ASCII =================
const ASCII_MAIN = `╔══════════╗
║ V1LE FARM
╚══════════╝`;

const ASCII_LB = `╔════════════╗
║ LEADERBOARD
╚════════════╝`;

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= SESSIONS =================
const sessions = {};

// HARD UI RESET — guarantees 1 menu only
async function hardResetUI(id) {
  const s = sessions[id];
  if (!s) return;

  if (s.uiMsgs) {
    for (const mid of s.uiMsgs) {
      await bot.deleteMessage(id, mid).catch(() => {});
    }
  }

  if (s.mainMenuId) {
    await bot.deleteMessage(id, s.mainMenuId).catch(() => {});
  }

  delete sessions[id];
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

// ================= XP =================
function giveXP(id, amount) {
  const u = users[id];
  if (!u || u.banned) return;

  u.xp += amount;
  u.weeklyXp += amount;

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

// ================= WEEKLY RESET =================
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  if (Date.now() - meta.weeklyReset >= WEEK_MS) {
    for (const id in users) users[id].weeklyXp = 0;
    meta.weeklyReset = Date.now();
    saveAll();
  }
}, 60 * 60 * 1000);

// ================= LEADERBOARD =================
function leaderboard(page = 0) {
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const size = 10;
  const slice = list.slice(page * size, page * size + size);

  let text = `${ASCII_LB}\n🏆 *Weekly Top Farmers*\n\n`;
  slice.forEach(([id, u], i) => {
    text += `#${page * size + i + 1} — @${u.username || id} — Lv ${u.level} — XP ${u.weeklyXp}\n`;
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
  await hardResetUI(id);

  sessions[id] = { uiMsgs: [] };

  const u = users[id];
  const orders = u.orders.length
    ? u.orders.map(o =>
        `${o.status === '✅ Accepted' ? '🟢' : o.status === '❌ Rejected' ? '🔴' : '⚪'} ${o.product} — ${o.grams}g`
      ).join('\n')
    : '_No orders yet_';

  const lb = leaderboard(page);

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    ...lb.buttons
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([{
      text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store',
      callback_data: meta.storeOpen ? 'store_close' : 'store_open'
    }]);
  }

  kb.push([{ text: '🔄 Reload Menu', callback_data: 'reload' }]);

  const msg = await bot.sendMessage(
    id,
`${ASCII_MAIN}
${meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}

🎚 Level: ${u.level}
📊 XP: ${xpBar(u.xp, u.level)}

📦 *Your Orders*
${orders}

${lb.text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );

  sessions[id].mainMenuId = msg.message_id;
}

// ================= START =================
bot.onText(/\/start|\/help/, m => showMainMenu(m.chat.id));

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (q.data === 'reload') return showMainMenu(id);

  if (q.data.startsWith('lb_')) {
    const p = Math.max(0, Number(q.data.split('_')[1]));
    return showMainMenu(id, p);
  }

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true;
    saveAll();
    return showMainMenu(id);
  }

  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false;
    saveAll();
    return showMainMenu(id);
  }

  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen) return;

    await hardResetUI(id);
    sessions[id] = {
      product: q.data.replace('product_', ''),
      uiMsgs: []
    };

    const m = await bot.sendMessage(id, '✏️ Send grams or $ amount');
    sessions[id].uiMsgs.push(m.message_id);
  }

  // ================= CONFIRM ORDER =================
  if (q.data === 'confirm') {
    const s = sessions[id];
    if (!s) return;

    const xp = Math.floor(2 + s.cash * 0.5);
    const orderIndex = users[id].orders.length;

    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: '⏳ Pending',
      pendingXP: xp,
      adminMsgs: []
    };

    users[id].orders.push(order);
    saveAll();

    // Send to admins with ACCEPT / REJECT
    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(
        admin,
`🧾 *NEW ORDER*
User: @${users[id].username || id}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}
Status: ⏳ Pending`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Accept', callback_data: `admin_accept_${id}_${orderIndex}` },
              { text: '❌ Reject', callback_data: `admin_reject_${id}_${orderIndex}` }
            ]]
          }
        }
      );
      order.adminMsgs.push({ admin, msgId: m.message_id });
    }

    await hardResetUI(id);
    return showMainMenu(id);
  }

  // ================= ADMIN ACTIONS =================
  if (q.data.startsWith('admin_')) {
    const [, action, uid, idx] = q.data.split('_');
    const userId = Number(uid);
    const index = Number(idx);

    const order = users[userId]?.orders[index];
    if (!order || order.status !== '⏳ Pending') return;

    if (action === 'accept') {
      order.status = '✅ Accepted';
      giveXP(userId, order.pendingXP);
      delete order.pendingXP;
    } else {
      order.status = '❌ Rejected';
      users[userId].orders.splice(index, 1);
    }

    // Update admin messages
    for (const { admin, msgId } of order.adminMsgs) {
      bot.editMessageText(
`🧾 *ORDER UPDATED*
User: @${users[userId].username || userId}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}
Status: ${order.status}`,
        { chat_id: admin, message_id: msgId, parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    saveAll();
    return showMainMenu(userId);
  }
});

// ================= USER INPUT =================
bot.on('message', async msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  if (!msg.from.is_bot) {
    setTimeout(() => bot.deleteMessage(id, msg.message_id).catch(() => {}), 2000);
  }

  const s = sessions[id];
  if (!s || !s.product) return;

  const price = PRODUCTS[s.product].price;
  let grams, cash;

  if (msg.text.startsWith('$')) {
    cash = Number(msg.text.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(Number(msg.text) * 2) / 2;
    cash = +(grams * price).toFixed(2);
  }

  if (!grams || grams < 1) return;

  s.grams = grams;
  s.cash = cash;

  await hardResetUI(id);
  sessions[id] = { ...s, uiMsgs: [] };

  const m = await bot.sendMessage(
    id,
`🧾 *Order Summary*
🌿 ${s.product}
⚖️ ${grams}g
💲 $${cash}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Confirm Order', callback_data: 'confirm' }],
          [{ text: '❌ Cancel', callback_data: 'reload' }]
        ]
      }
    }
  );

  sessions[id].uiMsgs.push(m.message_id);
});
