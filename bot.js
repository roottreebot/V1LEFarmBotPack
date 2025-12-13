// ===============================
// V1LEFarm Bot — Product + Admin Approval
// ===============================

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ Missing BOT_TOKEN or ADMIN_IDS");
  process.exit(1);
}

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("✅ Bot running");

// ---------- XP SYSTEM ----------
const DB = './users.json';
let users = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : {};
const saveUsers = () => fs.writeFileSync(DB, JSON.stringify(users, null, 2));

function addXP(id, amount = 1) {
  if (!users[id]) users[id] = { xp: 0, level: 1 };
  users[id].xp += amount;
  if (users[id].xp >= users[id].level * 5) {
    users[id].xp = 0;
    users[id].level++;
  }
  saveUsers();
}

// ---------- DATA ----------
const PRODUCTS = {
  god: { name: "God Complex", emoji: "🟢" },
  kgb: { name: "Killer Green Budz", emoji: "🌿" }
};

const sessions = {};
const orders = {};

// ---------- /start ----------
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  addXP(chatId);

  sessions[chatId] = { step: "product" };

  bot.sendMessage(
    chatId,
    "🌱 *Choose a product:*",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟢 God Complex", callback_data: "product_god" }],
          [{ text: "🌿 Killer Green Budz", callback_data: "product_kgb" }]
        ]
      }
    }
  );
});

// ---------- CALLBACKS ----------
bot.on('callback_query', q => {
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;
  const data = q.data;

  // USER: product select
  if (data.startsWith("product_")) {
    const key = data.split("_")[1];
    sessions[chatId] = { step: "cash", product: key };

    return bot.editMessageText(
      `✅ *${PRODUCTS[key].name} selected*\n\n💰 $10 per gram\n📦 Minimum $20\n\n✏️ Type amount (example: \`$30\`)`,
      { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" }
    );
  }

  // USER: confirm
  if (data === "confirm_order") {
    const s = sessions[chatId];
    if (!s) return;

    const orderId = Date.now().toString();
    orders[orderId] = { ...s, userId: chatId };

    const user =
      q.from.username
        ? `@${q.from.username}`
        : `[User](tg://user?id=${chatId})`;

    ADMIN_IDS.forEach(admin =>
      bot.sendMessage(
        admin,
        `🧾 *New Order*\n👤 ${user}\n📦 ${PRODUCTS[s.product].name}\n⚖️ ${s.grams}g\n💰 $${s.cash}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Accept", callback_data: `admin_accept_${orderId}` },
                { text: "❌ Reject", callback_data: `admin_reject_${orderId}` }
              ]
            ]
          }
        }
      )
    );

    sessions[chatId] = null;

    return bot.editMessageText("📨 Order sent to admins.", {
      chat_id: chatId,
      message_id: msgId
    });
  }

  // USER: cancel
  if (data === "cancel_order") {
    sessions[chatId] = null;
    return bot.editMessageText("❌ Order cancelled.", {
      chat_id: chatId,
      message_id: msgId
    });
  }

  // ADMIN: accept
  if (data.startsWith("admin_accept_")) {
    const id = data.split("_")[2];
    const o = orders[id];
    if (!o) return;

    addXP(o.userId, 2);
    bot.sendMessage(
      o.userId,
      `✅ *Order Accepted*\n\n📦 ${PRODUCTS[o.product].name}\n⚖️ ${o.grams}g\n💰 $${o.cash}`,
      { parse_mode: "Markdown" }
    );

    delete orders[id];
    return bot.editMessageText("✅ Order accepted.", {
      chat_id: q.message.chat.id,
      message_id: msgId
    });
  }

  // ADMIN: reject
  if (data.startsWith("admin_reject_")) {
    const id = data.split("_")[2];
    const o = orders[id];
    if (o) bot.sendMessage(o.userId, "❌ Your order was rejected.");
    delete orders[id];

    return bot.editMessageText("❌ Order rejected.", {
      chat_id: q.message.chat.id,
      message_id: msgId
    });
  }
});

// ---------- CASH INPUT ----------
bot.on('message', msg => {
  const chatId = msg.chat.id;
  const s = sessions[chatId];
  if (!s || s.step !== "cash") return;

  if (!msg.text.startsWith("$")) return;

  const cash = Number(msg.text.replace("$", ""));
  if (isNaN(cash) || cash < 20 || cash % 5 !== 0) {
    return bot.sendMessage(chatId, "❌ Minimum $20, increments of $5.");
  }

  s.cash = cash;
  s.grams = cash / 10;
  s.step = "confirm";

  bot.sendMessage(
    chatId,
    `🧾 *Order Summary*\n\n📦 ${PRODUCTS[s.product].name}\n⚖️ ${s.grams}g\n💰 $${cash}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirm Order", callback_data: "confirm_order" }],
          [{ text: "❌ Cancel", callback_data: "cancel_order" }]
        ]
      }
    }
  );
});
