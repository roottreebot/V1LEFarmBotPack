// === V1LE FARM BOT (FINAL, FIXED, RESPONSIVE) === // Features: // - /start always responds // - Leaderboard shown in main menu // - XP ONLY granted when order is ACCEPTED (not on submit) // - Chat XP optional (can disable) // - Main menu auto-recreated if deleted // - User messages auto-deleted after 2s // - Accept/Reject messages auto-delete after 10 min // - Handles 1k+ users (rate limit + no blocking ops)

const TelegramBot = require('node-telegram-bot-api'); const fs = require('fs');

// ================= ENV ================= const TOKEN = process.env.BOT_TOKEN; const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];

if (!TOKEN || ADMIN_IDS.length === 0) { console.error('❌ Missing BOT_TOKEN or ADMIN_IDS'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: { interval: 300, autoStart: true } }); console.log('✅ V1LE FARM BOT RUNNING');

// ================= FILE DB ================= const DB_FILE = 'users.json'; let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

function saveUsers() { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2)); }

function ensureUser(id, username = '') { if (!users[id]) { users[id] = { xp: 0, weeklyXp: 0, level: 1, orders: [], username, banned: false }; } if (username) users[id].username = username; }

// ================= CONFIG ================= const PRODUCTS = { 'God Complex': { price: 10 }, 'Killer Green Budz': { price: 10 } };

// ================= XP ================= function giveOrderXP(id, cash) { const xp = Math.floor(2 + cash * 0.5); users[id].xp += xp; users[id].weeklyXp += xp;

while (users[id].xp >= users[id].level * 10) { users[id].xp -= users[id].level * 10; users[id].level++; } saveUsers(); return xp; }

function xpBar(xp, lvl) { const max = lvl * 10; const fill = Math.floor((xp / max) * 10); return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) +  ${xp}/${max}; }

// ================= ASCII ================= const ASCII_MAIN = ╔══════════════╗ ║  🌱 V1LE FARM ║ ╚══════════════╝;

// ================= SESSIONS ================= const sessions = {};

async function sendMainMenu(id, page = 0) { ensureUser(id); sessions[id] = sessions[id] || {};

const u = users[id];

const productButtons = Object.keys(PRODUCTS).map(p => ([{ text: 🪴 ${p}, callback_data: product_${p} }]));

const leaderboard = getLeaderboard(page);

let text = `${ASCII_MAIN}

🎚 Level: ${u.level} 📊 XP: ${xpBar(u.xp, u.level)}

🏆 Weekly Leaderboard ${leaderboard}`;

try { if (sessions[id].menuMsg) { await bot.editMessageText(text, { chat_id: id, message_id: sessions[id].menuMsg, reply_markup: { inline_keyboard: productButtons }, parse_mode: 'Markdown' }); return; } } catch {}

const m = await bot.sendMessage(id, text, { reply_markup: { inline_keyboard: productButtons }, parse_mode: 'Markdown' });

sessions[id].menuMsg = m.message_id; }

// ================= LEADERBOARD ================= function getLeaderboard(page = 0, size = 5) { const sorted = Object.entries(users) .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp) .slice(page * size, page * size + size);

if (!sorted.length) return 'No data yet';

return sorted.map(([id, u], i) => { const name = u.username ? @${u.username} : id; return #${page * size + i + 1} ${name} — L${u.level} — XP ${u.weeklyXp}; }).join('\n'); }

// ================= START ================= bot.onText(//start|/help/, async msg => { const id = msg.chat.id; ensureUser(id, msg.from.username); await sendMainMenu(id); });

// ================= CALLBACKS ================= bot.on('callback_query', async q => { const id = q.message.chat.id; ensureUser(id, q.from.username); const s = sessions[id] = sessions[id] || {};

if (q.data.startsWith('product_')) { s.product = q.data.replace('product_', ''); s.step = 'amount'; return bot.sendMessage(id, ✏️ Send grams (min 2g) or $ amount, { parse_mode: 'Markdown' }); } });

// ================= USER INPUT ================= bot.on('message', async msg => { const id = msg.chat.id; if (!sessions[id] || sessions[id].step !== 'amount') return;

const s = sessions[id]; const price = PRODUCTS[s.product].price; let grams, cash;

const t = msg.text.trim(); if (t.startsWith('$')) { cash = parseFloat(t.slice(1)); grams = +(cash / price).toFixed(1); } else { grams = Math.round(parseFloat(t) * 2) / 2; cash = +(grams * price).toFixed(2); }

if (!grams || grams < 2) return bot.sendMessage(id, '❌ Minimum is 2g');

s.grams = grams; s.cash = cash; s.step = null;

users[id].orders.push({ product: s.product, grams, cash, status: 'Pending' }); saveUsers();

const orderIndex = users[id].orders.length - 1;

for (const admin of ADMIN_IDS) { await bot.sendMessage(admin, `🧾 NEW ORDER\nUser: ${users[id].username || id}\nProduct: ${s.product}\n${grams}g — $${
