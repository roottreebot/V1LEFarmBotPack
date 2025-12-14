// === V1LE FARM BOT — FINAL FIXED VERSION ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || [];

if (!TOKEN) {
  console.error('❌ BOT_TOKEN missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ Bot running');

// ================= DATABASE =================
const DB_FILE = 'users.json';
let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      level: 1,
      xp: 0,
      weeklyXp: 0,
      prestige: 0,
      orders: [],
      username: username || ''
    };
  }
  if (username) users[id].username = username;
}

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// ================= PRESTIGE =================
const PRESTIGE_LEVEL = 20;
function prestigeBonus(p) {
  return Math.min(p * 0.1, 0.5);
}

// ================= XP =================
function xpNeeded(lvl) {
  return Math.floor(20 + lvl * 8);
}

function addXP(id, amount) {
  const u = users[id];
  const bonus = 1 + prestigeBonus(u.prestige);
  const gained = Math.floor(amount * bonus);

  u.xp += gained;
  u.weeklyXp += gained;

  while (u.xp >= xpNeeded(u.level)) {
    u.xp -= xpNeeded(u.level);
    u.level++;
  }

  saveAll();
  return gained;
}

function addOrderXP(id, cash) {
  const base = 5;
  const scaled = cash * 0.6;
  const bonus = cash >= 50 ? 15 : cash >= 20 ? 7 : 0;
  return addXP(id, base + scaled + bonus);
}

function xpBar(xp, lvl) {
  const max = xpNeeded(lvl);
  const fill = Math.floor((xp / max) * 10);
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= ASCII =================
const ASCII = `
╔════════════╗
║  ROOTTREE  ║
╚════════════╝
V1LE FARM
`;

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

const sessions = {};

// ================= MENU =================
async function showMenu(id) {
  const u = users[id];

  const kb = Object.keys(PRODUCTS).map(p => [
    { text: `🌿 ${p}`, callback_data: `product_${p}` }
  ]);

  await bot.sendMessage(id,
`${ASCII}
🎚 Level: ${u.level} ${u.prestige ? `🏆 P${u.prestige}` : ''}
📊 XP: ${xpBar(u.xp, u.level)}
🔥 Prestige Bonus: +${Math.floor(prestigeBonus(u.prestige) * 100)}%

🛒 Select product 👇`,
{
  reply_markup: { inline_keyboard: kb }
});
}

// ================= COMMANDS =================
bot.onText(/^\/start$/, msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);
  showMenu(id);
});

bot.onText(/^\/help$/, msg => {
  bot.sendMessage(msg.chat.id, 'Use /start to open the menu\nUse /prestige at level 20');
});

bot.onText(/^\/prestige$/, msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);
  const u = users[id];

  if (u.level < PRESTIGE_LEVEL) {
    return bot.sendMessage(id, `❌ Reach level ${PRESTIGE_LEVEL} to prestige.`);
  }

  u.prestige++;
  u.level = 1;
  u.xp = 0;
  u.weeklyXp = 0;
  saveAll();

  bot.sendMessage(id,
`🏆 *PRESTIGE ACHIEVED*
You are now Prestige ${u.prestige}
🔥 XP Bonus: +${Math.floor(prestigeBonus(u.prestige) * 100)}%`,
{ parse_mode: 'Markdown' });

  showMenu(id);
});

// ================= CALLBACKS =================
bot.on('callback_query', q => {
  const id = q.message.chat.id;
  const data = q.data;
  ensureUser(id, q.from.username);

  if (data.startsWith('product_')) {
    const product = data.replace('product_', '');
    sessions[id] = { step: 'amount', product };
    return bot.sendMessage(id, `✏️ Enter grams or $ amount for *${product}*`, { parse_mode: 'Markdown' });
  }

  if (data === 'confirm_order') {
    const s = sessions[id];
    users[id].orders.push({ ...s, time: Date.now() });

    const earned = addOrderXP(id, s.cash);

    bot.sendMessage(id,
`🧾 *Order Confirmed*
🌿 ${s.product}
⚖️ ${s.grams}g
💲 $${s.cash}
⭐ XP Earned: ${earned}`,
{ parse_mode: 'Markdown' });

    showMenu(id);
  }
});

// ================= MESSAGE HANDLER (ONE ONLY) =================
bot.on('message', msg => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  const s = sessions[id];
  if (!s || s.step !== 'amount') {
    setTimeout(() => {
      bot.deleteMessage(id, msg.message_id).catch(() => {});
    }, 2000);
    return;
  }

  const price = PRODUCTS[s.product].price;
  let grams, cash;

  if (msg.text.startsWith('$')) {
    cash = parseFloat(msg.text.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(parseFloat(msg.text) * 2) / 2;
    cash = +(grams * price).toFixed(2);
  }

  if (!grams || grams < 1) return;

  s.grams = grams;
  s.cash = cash;

  bot.sendMessage(id,
`🧾 *Order Summary*
🌿 ${s.product}
⚖️ ${grams}g
💲 $${cash}`,
{
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [[{ text: '✅ Confirm', callback_data: 'confirm_order' }]]
  }
});

  setTimeout(() => {
    bot.deleteMessage(id, msg.message_id).catch(() => {});
  }, 2000);
});
