// ===============================
// V1LEFarm Bot – $ Input Only
// ===============================

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => Number(id))
  : [];

if (!TOKEN) {
  console.error("❌ BOT_TOKEN missing");
  process.exit(1);
}

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot running");

// -------------------------------
// XP SYSTEM
// -------------------------------
const DB_FILE = './users.json';
let users = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveUsers() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function getUser(id) {
  if (!users[id]) users[id] = { xp: 0, level: 1 };
  return users[id];
}

function addXP(id, amount = 1) {
  const u = getUser(id);
  u.xp += amount;
  if (u.xp >= u.level * 5) {
    u.level++;
    u.xp = 0;
  }
  saveUsers();
}

// -------------------------------
// ORDER SESSION
// -------------------------------
const sessions = {};

// -------------------------------
// /start
// -------------------------------
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  addXP(chatId, 1);

  sessions[chatId] = { state: "awaiting_cash" };

  const u = getUser(chatId);

  bot.sendMessage(
    chatId,
    `🌱 *V1LEFarm Orders*\n\n` +
    `⭐ Level: ${u.level}\n\n` +
    `Products:\n` +
    `🟢 God Complex\n` +
    `🌿 Killer Green Budz\n\n` +
    `💰 $10 per gram\n📦 Minimum $20 (2g)\n\n` +
    `✏️ *Type the amount you want*\n` +
    `Example: \`$35\``,
    { parse_mode: "Markdown" }
  );
});

// -------------------------------
// $ INPUT HANDLER
// -------------------------------
bot.on('message', msg => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!sessions[chatId]) return;
  if (!text || !text.startsWith("$")) return;

  const cash = Number(text.replace("$", ""));

  if (isNaN(cash)) {
    return bot.sendMessage(chatId, "❌ Invalid amount.");
  }

  if (cash < 20) {
    return bot.sendMessage(chatId, "❌ Minimum order is $20 (2g).");
  }

  const grams = cash / 10;
  if (grams % 0.5 !== 0) {
    return bot.sendMessage(chatId, "❌ Amount must convert to .5g increments.");
  }

  sessions[chatId] = {
    state: "confirm",
    grams,
    cash
  };

  bot.sendMessage(
    chatId,
    `🧾 *Order Summary*\n\n` +
    `Products:\n` +
    `• God Complex\n` +
    `• Killer Green Budz\n\n` +
    `⚖️ ${grams}g total\n` +
    `💰 $${cash}\n\n` +
    `Confirm order?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirm Order", callback_data: "confirm" }],
          [{ text: "❌ Cancel", callback_data: "cancel" }]
        ]
      }
    }
  );
});

// -------------------------------
// CONFIRM / CANCEL
// -------------------------------
bot.on('callback_query', q => {
  const chatId = q.message.chat.id;
  const session = sessions[chatId];
  if (!session || session.state !== "confirm") return;

  if (q.data === "cancel") {
    sessions[chatId] = null;
    return bot.editMessageText(
      "❌ Order cancelled.",
      { chat_id: chatId, message_id: q.message.message_id }
    );
  }

  if (q.data === "confirm") {
    const user =
      q.from.username
        ? `@${q.from.username}`
        : `[User](tg://user?id=${chatId})`;

    const receipt =
`🧾 *New Order*
👤 ${user}
⚖️ ${session.grams}g
💰 $${session.cash}
📦 Products:
• God Complex
• Killer Green Budz`;

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(id, receipt, { parse_mode: "Markdown" }).catch(() => {});
    });

    addXP(chatId, 2);
    sessions[chatId] = null;

    bot.editMessageText(
      "✅ Order confirmed. Admins have been notified 🌱",
      { chat_id: chatId, message_id: q.message.message_id }
    );
  }
});
