// === V1LE FARM BOT (FINAL: SQLITE + AUTO BACKUPS + IMPORT/EXPORT) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');
const path = require('path');
const Database = require('better-sqlite3');

// ================= ENV =================
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ BOT_TOKEN or ADMIN_IDS missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= PATHS =================
const DB_PATH = path.join(__dirname, 'data.db');
const BACKUP_DIR = path.join(__dirname, 'backups');
fs.ensureDirSync(BACKUP_DIR);

// ================= DATABASE =================
let db = new Database(DB_PATH);

// ================= SCHEMA =================
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  xp INTEGER,
  weeklyXp INTEGER,
  level INTEGER,
  banned INTEGER
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  product TEXT,
  grams REAL,
  cash REAL,
  status TEXT,
  pendingXP INTEGER
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

function getMeta(key, def) {
  const row = db.prepare('SELECT value FROM meta WHERE key=?').get(key);
  if (!row) {
    setMeta(key, JSON.stringify(def));
    return def;
  }
  return JSON.parse(row.value);
}

function setMeta(key, val) {
  db.prepare('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)')
    .run(key, JSON.stringify(val));
}

const meta = {
  weeklyReset: getMeta('weeklyReset', Date.now()),
  storeOpen: getMeta('storeOpen', true)
};

// ================= USERS =================
function ensureUser(id, username = '') {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) {
    db.prepare(`
      INSERT INTO users (id, username, xp, weeklyXp, level, banned)
      VALUES (?, ?, 0, 0, 1, 0)
    `).run(id, username);
  } else if (username && u.username !== username) {
    db.prepare('UPDATE users SET username=? WHERE id=?')
      .run(username, id);
  }
}

function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id=?').get(id);
}

// ================= XP =================
function giveXP(id, xp) {
  const u = getUser(id);
  if (!u || u.banned) return;

  let { level, xp: curXp, weeklyXp } = u;
  curXp += xp;
  weeklyXp += xp;

  while (curXp >= level * 5) {
    curXp -= level * 5;
    level++;
  }

  db.prepare(`
    UPDATE users SET xp=?, weeklyXp=?, level=? WHERE id=?
  `).run(curXp, weeklyXp, level, id);
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

// ================= ASCII =================
const ASCII_MAIN = `╔═════════╗
║ V1LE FARM
╚═════════╝`;

const ASCII_LB = `╔════════════╗
║ LEADERBOARD
╚════════════╝`;

// ================= SESSIONS =================
const sessions = {};
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
}

// ================= LEADERBOARD =================
function getLeaderboard(page = 0) {
  const size = 10;
  const rows = db.prepare(`
    SELECT * FROM users
    WHERE banned=0
    ORDER BY weeklyXp DESC
    LIMIT ? OFFSET ?
  `).all(size, page * size);

  let text = `${ASCII_LB}\n🏆 *Weekly Top Farmers*\n\n`;
  rows.forEach((u, i) => {
    text += `#${page * size + i + 1} — @${u.username || u.id} — Lv ${u.level} — XP ${u.weeklyXp}\n`;
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
  const u = getUser(id);
  if (!u) return;

  const orders = db.prepare(`
    SELECT * FROM orders WHERE userId=?
  `).all(id);

  const ordersText = orders.length
    ? orders.map(o =>
        `${o.status === '✅ Accepted' ? '🟢' : '⚪'} ${o.product} — ${o.grams}g — $${o.cash} — *${o.status}*`
      ).join('\n')
    : '_No orders yet_';

  const lb = getLeaderboard(page);

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    ...lb.buttons,
    [{ text: '🔄 Reload Menu', callback_data: 'reload_menu' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([{
      text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store',
      callback_data: meta.storeOpen ? 'store_close' : 'store_open'
    }]);
  }

  await sendOrEdit(id,
`${ASCII_MAIN}
${meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}
🎚 Level: ${u.level}
📊 XP: ${xpBar(u.xp, u.level)}

📦 *Your Orders*
${ordersText}

${lb.text}`,
{
  parse_mode: 'Markdown',
  reply_markup: { inline_keyboard: kb }
});
}

// ================= BACKUPS =================
function createBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `backup-${ts}.db`);
  fs.copyFileSync(DB_PATH, dest);

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .sort();

  while (files.length > 24) {
    fs.removeSync(path.join(BACKUP_DIR, files.shift()));
  }
}

setInterval(createBackup, 60 * 60 * 1000);
createBackup();

// ================= IMPORT / EXPORT =================
bot.onText(/\/exportdb/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
  if (!files.length) return bot.sendMessage(msg.chat.id, '❌ No backups found');
  bot.sendDocument(msg.chat.id, path.join(BACKUP_DIR, files[files.length - 1]));
});

bot.onText(/\/importdb/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
  if (!files.length) return bot.sendMessage(msg.chat.id, '❌ No backups found');

  db.close();
  fs.copyFileSync(path.join(BACKUP_DIR, files[files.length - 1]), DB_PATH);
  db = new Database(DB_PATH);

  bot.sendMessage(msg.chat.id, '✅ Database restored from latest backup');
});

// ================= START =================
bot.onText(/\/start|\/help/, msg => {
  ensureUser(msg.chat.id, msg.from.username);
  showMainMenu(msg.chat.id, 0);
});
