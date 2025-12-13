// V1LEFarm Bot — Full Advanced Version

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// --- Config ---
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(x => Number(x)) : [];
const DB_FILE = 'users.json';

// --- Load Users ---
let users = {};
if (fs.existsSync(DB_FILE)) users = JSON.parse(fs.readFileSync(DB_FILE));

// --- Initialize Bot ---
const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ V1LEFarm Bot started');

// --- Products ---
const PRODUCTS = [
  { name: 'God Complex', emoji: '🟢', price: 10 },
  { name: 'Killer Green Budz', emoji: '🌿', price: 10 }
];

// --- Sessions ---
const sessions = {};

// --- Helpers ---
function saveUsers(){ fs.writeFileSync(DB_FILE, JSON.stringify(users,null,2)); }

function ensureUser(chatId){
  if(!users[chatId]) users[chatId] = { xp: 0, level: 1 };
}

function addXP(chatId, amount){
  ensureUser(chatId);
  users[chatId].xp += amount;
  while(users[chatId].xp >= users[chatId].level * 5){
    users[chatId].xp -= users[chatId].level * 5;
    users[chatId].level += 1;
    bot.sendMessage(chatId, `🎉 Congrats! You reached Level ${users[chatId].level}!`);
  }
  saveUsers();
}

function xpBar(xp, level){
  const total = level*5;
  const filled = Math.round((xp/total)*10);
  const empty = 10 - filled;
  return '⭐'.repeat(filled) + '⚪'.repeat(empty) + ` (${xp}/${total} XP)`;
}

function sendToAdmins(msg, options={}){
  ADMIN_IDS.forEach(id => bot.sendMessage(id, msg, options).catch(()=>{}));
}

// --- Start Command ---
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  ensureUser(chatId);
  sessions[chatId] = { step: 'product' };
  addXP(chatId, 1);

  const bar = xpBar(users[chatId].xp, users[chatId].level);

  bot.sendMessage(chatId,
    `🌱 *Welcome to V1LEFarm*\n\n⭐ Level: *${users[chatId].level}*\nXP: ${bar}\n\nSelect a product:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `${PRODUCTS[0].emoji} ${PRODUCTS[0].name}`, callback_data: `product_0` }],
          [{ text: `${PRODUCTS[1].emoji} ${PRODUCTS[1].name}`, callback_data: `product_1` }]
        ]
      }
    }
  );
});

// --- Callback Queries ---
bot.on('callback_query', query => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  ensureUser(chatId);
  if(!sessions[chatId]) sessions[chatId] = { step: 'product' };
  const session = sessions[chatId];

  const username = query.from.username ? `@${query.from.username}` : query.from.first_name || 'User';
  const userLink = `[${username}](tg://user?id=${chatId})`;

  // --- Product Selection ---
  if(data.startsWith('product_') && session.step==='product'){
    const prodIndex = parseInt(data.split('_')[1]);
    session.product = prodIndex;
    session.step = 'amount';
    const product = PRODUCTS[prodIndex];
    bot.editMessageText(
      `You chose: ${product.name}\nMinimum 2g, add by 0.5g. $${product.price} per gram.\n\nType the amount you want in $ (e.g., 20) or grams (e.g., 2.5):`,
      { chat_id: chatId, message_id: msgId }
    );
    return;
  }

  // --- Accept/Reject Admin Buttons ---
  if(data.startsWith('admin_accept_')){
    const [_, chatStr, productIndex, grams, cash] = data.split('_');
    const targetChat = parseInt(chatStr);
    const product = PRODUCTS[parseInt(productIndex)];
    bot.sendMessage(targetChat, `✅ Your order for ${grams}g ${product.name} ($${cash}) has been accepted by an admin.`);
    bot.editMessageText(`✅ Accepted by admin`, { chat_id: chatId, message_id: msgId });
    return;
  }

  if(data.startsWith('admin_reject_')){
    const [_, chatStr, productIndex, grams, cash] = data.split('_');
    const targetChat = parseInt(chatStr);
    const product = PRODUCTS[parseInt(productIndex)];
    bot.sendMessage(targetChat, `❌ Your order for ${grams}g ${product.name} ($${cash}) has been rejected by an admin.`);
    bot.editMessageText(`❌ Rejected by admin`, { chat_id: chatId, message_id: msgId });
    return;
  }
});

// --- Text Messages (amount input) ---
bot.on('message', msg => {
  const chatId = msg.chat.id;
  if(!sessions[chatId] || !sessions[chatId].step) return;
  const session = sessions[chatId];

  // Ignore /start
  if(msg.text.startsWith('/')) return;

  if(session.step==='amount'){
    const input = msg.text.trim();
    const product = PRODUCTS[session.product];
    let grams, cash;

    if(input.startsWith('$')){
      cash = parseFloat(input.replace('$',''));
      if(isNaN(cash)) return bot.sendMessage(chatId,'❌ Invalid amount');
      grams = +(cash/product.price).toFixed(1);
      if(grams<2) grams=2;
    } else {
      grams = parseFloat(input);
      if(isNaN(grams) || grams<2) return bot.sendMessage(chatId,'❌ Minimum is 2g');
      grams = Math.round(grams*2)/2; // 0.5g increments
      cash = +(grams*product.price).toFixed(2);
    }

    session.step='confirm';
    session.grams = grams;
    session.cash = cash;

    const confirmKeyboard = ADMIN_IDS.map(id => [
      { text: '✅ Accept', callback_data:`admin_accept_${chatId}_${session.product}_${grams}_${cash}` },
      { text: '❌ Reject', callback_data:`admin_reject_${chatId}_${session.product}_${grams}_${cash}` }
    ]);

    sendToAdmins(
      `📩 New Order from ${userLink}\nProduct: ${product.name}\nGrams: ${grams}g\n$${cash}`,
      { parse_mode:'Markdown', reply_markup: { inline_keyboard: confirmKeyboard } }
    );

    bot.sendMessage(chatId,
      `📝 Your order for ${grams}g ${product.name} ($${cash}) has been sent to admins.\nYour level: ${users[chatId].level}\nXP: ${xpBar(users[chatId].xp, users[chatId].level)}`,
      { parse_mode: 'Markdown' }
    );

    addXP(chatId, 2); // XP per order
  }
});
