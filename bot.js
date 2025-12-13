// ===============================
// V1LEFarm Bot – Orders + XP + Cash Input
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
console.log("✅ Bot started");

// -------------------------------
// XP SYSTEM
// -------------------------------
const DB_FILE = './users.json';
let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
function saveUsers(){ fs.writeFileSync(DB_FILE, JSON.stringify(users,null,2)); }

function getUser(id){
  if(!users[id]) users[id]={xp:0,level:1};
  return users[id];
}
function addXP(id, amt=1){
  const u=getUser(id);
  u.xp+=amt;
  if(u.xp>=u.level*5){
    u.level++; u.xp=0;
  }
  saveUsers();
}

// -------------------------------
// PRODUCTS
// -------------------------------
const PRODUCTS = {
  god: { name:"God Complex", emoji:"🟢", price:10 },
  killer: { name:"Killer Green Budz", emoji:"🌿", price:10 }
};

const GRAMS = [2,2.5,3,3.5,4,5];

// Per-user order session
const sessions = {};

// -------------------------------
// /start
// -------------------------------
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  addXP(chatId,1);

  sessions[chatId] = { state:"product" };

  bot.sendMessage(
    chatId,
    `🌱 *Welcome to V1LEFarm*\n\n`+
    `⭐ Level: ${user.level}\n`+
    `⚡ XP: ${user.xp}/${user.level*5}\n\n`+
    `Select a product:`,
    {
      parse_mode:"Markdown",
      reply_markup:{
        inline_keyboard:[
          [{text:"🟢 God Complex",callback_data:"prod_god"}],
          [{text:"🌿 Killer Green Budz",callback_data:"prod_killer"}]
        ]
      }
    }
  );
});

// -------------------------------
// CALLBACK HANDLER
// -------------------------------
bot.on('callback_query', q=>{
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;
  const data = q.data;
  const session = sessions[chatId] || {};

  // PRODUCT SELECT
  if(data.startsWith("prod_")){
    session.product = data.split("_")[1];
    session.state = "grams";
    sessions[chatId] = session;

    const buttons = GRAMS.map(g => [{text:`${g}g`, callback_data:`g_${g}`}]);

    bot.editMessageText(
      `*${PRODUCTS[session.product].emoji} ${PRODUCTS[session.product].name}*\n\n`+
      `💲 $10 per gram\n📦 Minimum 2g\n\n`+
      `➡️ Select quantity *or type* \`$amount\`\n`+
      `Example: \`$35\``,
      {
        chat_id:chatId,
        message_id:msgId,
        parse_mode:"Markdown",
        reply_markup:{ inline_keyboard: buttons }
      }
    );
  }

  // GRAM BUTTON SELECT
  if(data.startsWith("g_")){
    if(session.state !== "grams") return;
    finalizeQuantity(chatId, msgId, session, Number(data.split("_")[1]));
  }

  // CONFIRM
  if(data === "confirm"){
    if(session.state !== "confirm") return;

    const user = q.from.username
      ? `@${q.from.username}`
      : `[User](tg://user?id=${chatId})`;

    const receipt =
`🧾 *New Order*
👤 ${user}
🌿 ${PRODUCTS[session.product].name}
⚖️ ${session.grams}g
💰 $${session.price}`;

    ADMIN_IDS.forEach(id=>{
      bot.sendMessage(id, receipt, {parse_mode:"Markdown"}).catch(()=>{});
    });

    addXP(chatId,2);
    sessions[chatId] = null;

    bot.editMessageText(
      `✅ *Order Confirmed!*\n\nThank you for ordering 🌱`,
      { chat_id:chatId, message_id:msgId, parse_mode:"Markdown" }
    );
  }

  // CANCEL
  if(data === "cancel"){
    sessions[chatId] = null;
    bot.editMessageText(
      `❌ Order cancelled.`,
      { chat_id:chatId, message_id:msgId }
    );
  }
});

// -------------------------------
// CASH INPUT HANDLER ($)
// -------------------------------
bot.on('message', msg=>{
  const chatId = msg.chat.id;
  const text = msg.text;
  const session = sessions[chatId];

  if(!session || session.state !== "grams") return;
  if(!text || !text.startsWith("$")) return;

  const cash = Number(text.replace("$",""));
  if(isNaN(cash)){
    return bot.sendMessage(chatId,"❌ Invalid amount.");
  }

  if(cash < 20){
    return bot.sendMessage(chatId,"❌ Minimum order is $20 (2g).");
  }

  const grams = cash / 10;
  if(grams % 0.5 !== 0){
    return bot.sendMessage(chatId,"❌ Amount must convert to .5g increments.");
  }

  finalizeQuantity(chatId, null, session, grams);
});

// -------------------------------
// FINALIZE ORDER
// -------------------------------
function finalizeQuantity(chatId, msgId, session, grams){
  session.grams = grams;
  session.price = grams * 10;
  session.state = "confirm";

  bot.sendMessage(
    chatId,
    `🧾 *Order Summary*\n\n`+
    `🌿 ${PRODUCTS[session.product].name}\n`+
    `⚖️ ${grams}g\n`+
    `💰 $${session.price}\n\n`+
    `Confirm your order:`,
    {
      parse_mode:"Markdown",
      reply_markup:{
        inline_keyboard:[
          [{text:"✅ Confirm Order", callback_data:"confirm"}],
          [{text:"❌ Cancel", callback_data:"cancel"}]
        ]
      }
    }
  );
}
