// === V1LE FARM BOT ===
// High-traffic | Clean UI | Auto cleanup | Anti-spam
// ENV: BOT_TOKEN, ADMIN_IDS=123,456

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

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

let saveTimeout = null;
function saveUsersDebounced() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    }, 500);
}

// ================= CONFIG =================
const PRODUCTS = {
    'God Complex': { price: 10 },
    'Killer Green Budz': { price: 10 }
};

const sessions = {};

// ================= RATE LIMITER =================
const lastAction = {}; // chatId -> timestamp
const RATE_LIMIT_MS = 1200;

function isRateLimited(chatId) {
    const now = Date.now();
    if (!lastAction[chatId]) {
        lastAction[chatId] = now;
        return false;
    }
    if (now - lastAction[chatId] < RATE_LIMIT_MS) return true;
    lastAction[chatId] = now;
    return false;
}

// ================= CLEAN MESSAGE SYSTEM =================
const botMessages = {}; // chatId -> msgId

async function safeDelete(chatId, msgId) {
    try { await bot.deleteMessage(chatId, msgId); } catch {}
}

async function sendCleanMessage(chatId, text, options = {}) {
    if (botMessages[chatId]) safeDelete(chatId, botMessages[chatId]);
    const sent = await bot.sendMessage(chatId, text, options);
    botMessages[chatId] = sent.message_id;
    return sent;
}

// ================= XP SYSTEM =================
function addXP(chatId, xp) {
    if (!users[chatId]) users[chatId] = { xp: 0, level: 1 };
    users[chatId].xp += xp;

    let leveled = false;
    while (users[chatId].xp >= users[chatId].level * 5) {
        users[chatId].xp -= users[chatId].level * 5;
        users[chatId].level++;
        leveled = true;
    }

    saveUsersDebounced();
    return leveled;
}

function xpBar(xp, level) {
    const max = level * 5;
    const filled = Math.floor((xp / max) * 10);
    return '🟥'.repeat(filled) + '⬜'.repeat(10 - filled) + ` ${xp}/${max}`;
}

// ================= ASCII HEADER =================
const HEADER = `
\`\`\`
██╗   ██╗ ██╗██╗     ███████╗
██║   ██║ ██║██║     ██╔════╝
██║   ██║ ██║██║     █████╗  
╚██╗ ██╔╝ ██║██║     ██╔══╝  
 ╚████╔╝  ██║███████╗███████╗
  ╚═══╝   ╚═╝╚══════╝╚══════╝
        V 1 L E   F A R M
\`\`\`
`;

// ================= MENU =================
function showMenu(chatId) {
    const keyboard = Object.keys(PRODUCTS).map(p => [
        { text: `🌿 ${p}`, callback_data: `product_${p}` }
    ]);

    sendCleanMessage(
        chatId,
        `${HEADER}
🛒 *ORDER MENU*
Select a product below 👇`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
    );
}

// ================= START =================
bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;
    if (isRateLimited(chatId)) return;

    if (!users[chatId]) users[chatId] = { xp: 0, level: 1 };
    sessions[chatId] = {};

    showMenu(chatId);
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
    const chatId = q.message.chat.id;
    if (isRateLimited(chatId)) return;

    const msgId = q.message.message_id;
    const data = q.data;

    if (!sessions[chatId]) sessions[chatId] = {};
    const s = sessions[chatId];

    // PRODUCT SELECT
    if (data.startsWith('product_')) {
        s.product = data.replace('product_', '');
        s.step = 'amount';

        bot.editMessageText(
            `${HEADER}
🌿 *${s.product}*

▫️ Minimum: *2g*
▫️ Price: *$10/g*

✏️ Send grams (2.5)
💲 Or $ amount ($25)`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
        );
        return;
    }

    // CONFIRM (LOCKED)
    if (data === 'confirm_order') {
        if (s.locked) return;
        s.locked = true;

        s.adminMsgs = [];
        for (const adminId of ADMIN_IDS) {
            const sent = await bot.sendMessage(
                adminId,
                `📦 *NEW ORDER*
👤 [User](tg://user?id=${chatId})
🌿 ${s.product}
⚖️ ${s.grams}g
💲 $${s.cash}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Accept', callback_data: `admin_accept_${chatId}` },
                            { text: '❌ Reject', callback_data: `admin_reject_${chatId}` }
                        ]]
                    }
                }
            );
            s.adminMsgs.push({ adminId, msgId: sent.message_id });
        }

        const leveled = addXP(chatId, 2);

        sendCleanMessage(
            chatId,
            `${HEADER}
📨 *Order Sent*

🎚 Level: *${users[chatId].level}*
📊 ${xpBar(users[chatId].xp, users[chatId].level)}
${leveled ? '\n🎉 *LEVEL UP!*' : ''}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // CANCEL
    if (data === 'cancel_order') {
        sessions[chatId] = {};
        sendCleanMessage(chatId, `${HEADER}\n❌ *Order Cancelled*`, { parse_mode: 'Markdown' });
        return;
    }

    // ADMIN ACTION
    if (data.startsWith('admin_')) {
        const [, action, userId] = data.split('_');
        const us = sessions[userId];
        if (!us) return;

        bot.sendMessage(
            userId,
            action === 'accept'
                ? '✅ *Order Accepted*'
                : '❌ *Order Rejected*',
            { parse_mode: 'Markdown' }
        );

        for (const m of us.adminMsgs || []) {
            bot.editMessageText(
                `📦 *ORDER ${action.toUpperCase()}*
🌿 ${us.product}
⚖️ ${us.grams}g
💲 $${us.cash}`,
                { chat_id: m.adminId, message_id: m.msgId, parse_mode: 'Markdown' }
            ).catch(() => {});
        }

        sessions[userId] = {};
    }
});

// ================= USER INPUT (AUTO DELETE + RATE LIMIT) =================
bot.on('message', async msg => {
    const chatId = msg.chat.id;
    if (!sessions[chatId] || sessions[chatId].step !== 'amount') return;
    if (msg.text.startsWith('/')) return;
    if (isRateLimited(chatId)) {
        safeDelete(chatId, msg.message_id);
        return;
    }

    const s = sessions[chatId];
    const price = PRODUCTS[s.product].price;
    const text = msg.text.trim();

    safeDelete(chatId, msg.message_id);

    let grams, cash;

    if (text.startsWith('$')) {
        cash = parseFloat(text.slice(1));
        if (isNaN(cash) || cash < price * 2)
            return sendCleanMessage(chatId, '❌ Minimum $20');

        grams = +(cash / price).toFixed(1);
    } else {
        grams = parseFloat(text);
        if (isNaN(grams) || grams < 2)
            return sendCleanMessage(chatId, '❌ Minimum 2g');

        grams = Math.round(grams * 2) / 2;
        cash = +(grams * price).toFixed(2);
    }

    s.grams = grams;
    s.cash = cash;
    s.step = 'confirm';

    sendCleanMessage(
        chatId,
        `${HEADER}
🧾 *Order Summary*

🌿 ${s.product}
⚖️ ${grams}g
💲 $${cash}`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Confirm', callback_data: 'confirm_order' }],
                    [{ text: '❌ Cancel', callback_data: 'cancel_order' }]
                ]
            }
        }
    );
});
