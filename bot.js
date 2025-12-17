// === V1LE FARM BOT — FINAL STABLE (XP ON ACCEPT ONLY) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ================= CONFIG =================
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

// ================= DATABASE =================
const DB_FILE = 'users.json';
let users = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

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

// ================= XP =================
function addXP(id, cash) {
  const baseXP = 5;
  const valueXP = cash * 0.5;
  const bonusXP = cash >= 50 ? 10 : cash >= 20 ? 5 : 0;
  const totalXP = Math.floor(baseXP + valueXP + bonusXP);

  users[id].xp += totalXP;
  users[id].weeklyXp += totalXP;

  while (users[id].xp >= users[id].level * 5) {
    users[id].xp -= users[id].level * 5;
    users[id].level++;
  }

  saveAll();
  return totalXP;
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.floor((xp / max) * 10);
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= ASCII =================
const ASCII_MAIN = `
╔════════════╗
║  ROOTTREE  ║
╚════════════╝
V1LE FARM
`;

// ================= SESSIONS =================
const sessions = {};

// ================= SAFE SEND / EDIT =================
async function sendOrEdit(id, text, opt = {}) {
  if (!sessions[id]) sessions[id] = {};
  const msgId = sessions[id].mainMsgId;

  if (msgId) {
    try {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: msgId,
        ...opt
      });
      return;
    } catch {
      sessions[id].mainMsgId = null;
    }
  }

  const sent = await bot.sendMessage(id, text, opt);
  sessions[id].mainMsgId = sent.message_id;
}

// ================= MAIN MENU =================
async function showMainMenu(id) {
  ensureUser(id);
  sessions[id] = sessions[id] || {};
  sessions[id].step = null;

  const kb = Object.keys(PRODUCTS).map(p => [
    { text: `🌿 ${p}`, callback_data: `product_${p}` }
  ]);

  await sendOrEdit(
    id,
`${ASCII_MAIN}
🎚 Level: ${users[id].level}
📊 XP: ${xpBar(users[id].xp, users[id].level)}

🛒 Select a product 👇`,
    { reply_markup: { inline_keyboard: kb } }
  );
}

// ================= START =================
bot.onText(/^\/start|\/help$/, msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);
  showMainMenu(id);
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const s = sessions[id] || (sessions[id] = {});

  if (q.data.startsWith('product_')) {
    s.product = q.data.replace('product_', '');
    s.step = 'amount';
    return sendOrEdit(
      id,
`${ASCII_MAIN}
🌿 *${s.product}*
✏️ Send grams or $ amount`,
      { parse_mode: 'Markdown' }
    );
  }

  if (q.data === 'confirm_order') {
    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: 'Pending',
      time: Date.now()
    };

    users[id].orders.push(order);
    saveAll();

    for (const adminId of ADMIN_IDS) {
      await bot.sendMessage(
        adminId,
`📦 *NEW ORDER*
User: @${users[id].username || id}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Accept', callback_data: `admin_accept_${id}_${users[id].orders.length - 1}` },
              { text: '❌ Reject', callback_data: `admin_reject_${id}_${users[id].orders.length - 1}` }
            ]]
          }
        }
      );
    }

    return showMainMenu(id);
  }

  if (q.data.startsWith('admin_')) {
    const [, action, uid, index] = q.data.split('_');
    const userId = Number(uid);
    const orderIndex = Number(index);

    ensureUser(userId);
    const order = users[userId].orders[orderIndex];
    if (!order || order.status !== 'Pending') return;

    if (action === 'accept') {
      order.status = '✅ Accepted';
      const earnedXP = addXP(userId, order.cash);

      const msg = await bot.sendMessage(
        userId,
`✅ *Order Accepted*
🌿 ${order.product}
⭐ XP Earned: ${earnedXP}`,
        { parse_mode: 'Markdown' }
      );

      setTimeout(() => {
        bot.deleteMessage(userId, msg.message_id).catch(() => {});
      }, 600000);
    } else {
      order.status = '❌ Rejected';

      const msg = await bot.sendMessage(
        userId,
`❌ *Order Rejected*
🌿 ${order.product}`,
        { parse_mode: 'Markdown' }
      );

      setTimeout(() => {
        bot.deleteMessage(userId, msg.message_id).catch(() => {});
      }, 600000);
    }

    saveAll();
    showMainMenu(userId);
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

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

  sendOrEdit(
    id,
`${ASCII_MAIN}
🧾 Order Summary
🌿 ${s.product}
⚖️ ${grams}g
💲 $${cash}`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Confirm', callback_data: 'confirm_order' }
        ]]
      }
    }
  );

  setTimeout(() => {
    bot.deleteMessage(id, msg.message_id).catch(() => {});
  }, 3000);
});
