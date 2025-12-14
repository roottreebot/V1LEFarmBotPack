// === V1LE FARM BOT — FINAL + PRESTIGE SYSTEM ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ BOT_TOKEN or ADMIN_IDS missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ Bot running');

// ================= DATABASE =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE)) : { weeklyReset: Date.now() };

function ensureUser(id, username) {
  if (!users[id]) users[id] = {
    xp: 0,
    weeklyXp: 0,
    level: 1,
    prestige: 0,
    orders: [],
    banned: false,
    username: username || ''
  };
  if (username) users[id].username = username;
}

// ================= SAVE =================
let saveTimer;
function saveAll() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  }, 200);
}

// ================= PRESTIGE CONFIG =================
const PRESTIGE_LEVEL = 20;
const PRESTIGE_XP_CAP = 0.5; // 50% max bonus

function prestigeMultiplier(p) {
  return Math.min(p * 0.10, PRESTIGE_XP_CAP);
}

function prestigeBadge(p) {
  return p === 0 ? '' : `🏆 P${p}`;
}

// ================= XP SYSTEM =================
function xpNeeded(level) {
  return Math.floor(15 + level * 7 + Math.pow(level, 1.4));
}

function applyXP(id, xp) {
  ensureUser(id);

  const prestigeBonus = 1 + prestigeMultiplier(users[id].prestige);
  const totalXP = Math.floor(xp * prestigeBonus);

  users[id].xp += totalXP;
  users[id].weeklyXp += totalXP;

  while (users[id].xp >= xpNeeded(users[id].level)) {
    users[id].xp -= xpNeeded(users[id].level);
    users[id].level++;
  }

  saveAll();
  return totalXP;
}

// ORDER XP
function addOrderXP(id, cash) {
  const baseXP = 5;
  const cashXP = cash * 0.6;
  const bonusXP = cash >= 50 ? 15 : cash >= 20 ? 7 : 0;
  const levelBoost = 1 + users[id].level * 0.03;

  return applyXP(id, (baseXP + cashXP + bonusXP) * levelBoost);
}

// CHAT XP
const CHAT_XP = 1;
const CHAT_CD = 5000;
const chatCD = {};

function addChatXP(id) {
  const now = Date.now();
  if (chatCD[id] && now - chatCD[id] < CHAT_CD) return;
  chatCD[id] = now;
  applyXP(id, CHAT_XP);
}

function xpBar(xp, lvl) {
  const max = xpNeeded(lvl);
  const filled = Math.floor((xp / max) * 10);
  return '🟩'.repeat(filled) + '⬜'.repeat(10 - filled) + ` ${xp}/${max}`;
}

// ================= ASCII =================
const ASCII_MAIN = `
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

// ================= DELETE + CHAT XP =================
bot.on('message', msg => {
  if (!msg.from || msg.from.is_bot) return;
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  addChatXP(id);

  setTimeout(() => {
    bot.deleteMessage(id, msg.message_id).catch(() => {});
  }, 2000);
});

// ================= MENU =================
async function showMenu(id) {
  const u = users[id];

  const buttons = Object.keys(PRODUCTS).map(p => [
    { text: `🌿 ${p}`, callback_data: `product_${p}` }
  ]);

  await bot.sendMessage(id,
`${ASCII_MAIN}
🎚 Level: ${u.level} ${prestigeBadge(u.prestige)}
📊 XP: ${xpBar(u.xp, u.level)}
🔥 Prestige Bonus: +${Math.floor(prestigeMultiplier(u.prestige) * 100)}%

🛒 Choose product 👇`,
{
  parse_mode: 'Markdown',
  reply_markup: { inline_keyboard: buttons }
});
}

// ================= COMMANDS =================
bot.onText(/\/start|\/menu|\/help/i, msg => {
  showMenu(msg.chat.id);
});

bot.onText(/\/prestige/i, msg => {
  const id = msg.chat.id;
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
`🏆 *PRESTIGE UNLOCKED!*
You are now *Prestige ${u.prestige}*

🔥 Permanent XP Bonus: +${Math.floor(prestigeMultiplier(u.prestige) * 100)}%`,
{ parse_mode: 'Markdown' });

  showMenu(id);
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const data = q.data;

  if (data.startsWith('product_')) {
    const product = data.replace('product_', '');
    sessions[id] = { product, step: 'amount' };
    return bot.sendMessage(id, `✏️ Enter grams or $ amount for *${product}*`, { parse_mode: 'Markdown' });
  }

  if (data === 'confirm_order') {
    const s = sessions[id];
    users[id].orders.push({ ...s, time: Date.now() });
    const xp = addOrderXP(id, s.cash);

    bot.sendMessage(id,
`🧾 *Order Confirmed*
🌿 ${s.product}
⚖️ ${s.grams}g
💲 $${s.cash}

⭐ XP Earned: *${xp}*`,
{ parse_mode: 'Markdown' });

    showMenu(id);
  }
});

// ================= ORDER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
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
