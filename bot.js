// === V1LE FARM BOT ===
// High-traffic | Clean UI | Anti-spam | Order History | Profile
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

function ensureUser(chatId) {
    if (!users[chatId]) {
        users[chatId] = { xp: 0, level: 1, orders: [] };
    }
    if (!users[chatId].orders) users[chatId].orders = [];
}

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

const COMMANDS_TEXT = `
📜 *Available Commands*

/start – Open menu
/profile – View your profile
/help – Show commands
`;

// ================= SESSION / RATE LIMIT =================
const sessions = {};
const lastAction = {};
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
const botMessages = {};

async function safeDelete(chatId, msgId) {
    try { await bot.deleteMessage(chatId, msgId); } catch {}
}

async function sendCleanMessage(chatId, text, options = {}) {
    if (botMessages[chatId]) safeDelete(chatId, botMessages[chatId]);
    const sent = await bot.sendMessage(chatId, text, options);
    botMessages[chatId] = sent.message_id;
    return sent;
}

async function sendCleanPhoto(chatId, photo, options = {}) {
    if (botMessages[chatId]) safeDelete(chatId, botMessages[chatId]);
    const sent = await bot.sendPhoto(chatId, photo, options);
    botMessages[chatId] = sent.message_id;
    return sent;
}

// ================= XP SYSTEM =================
function addXP(chatId, xp) {
    ensureUser(chatId);
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

// ================= START =================
bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;
    if (isRateLimited(chatId)) return;

    ensureUser(chatId);
    sessions[chatId] = {};

    const keyboard = Object.keys(PRODUCTS).map(p => [
        { text: `🌿 ${p}`, callback_data: `product_${p}` }
    ]);

    sendCleanMessage(
        chatId,
        `${HEADER}
👤 *Your Profile*
🎚 Level: *${users[chatId].level}*
📊 XP: ${xpBar(users[chatId].xp, users[chatId].level)}

🛒 *Order Menu*
Select a product below 👇
${COMMANDS_TEXT}`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
    );
});

// ================= HELP =================
bot.onText(/\/help/, msg => {
    const chatId = msg.chat.id;
    if (isRateLimited(chatId)) return;

    sendCleanMessage(chatId, `${HEADER}\n${COMMANDS_TEXT}`, { parse_mode: 'Markdown' });
});

// ================= PROFILE =================
bot.onText(/\/profile/, async msg => {
    const chatId = msg.chat.id;
    if (isRateLimited(chatId)) return;

    ensureUser(chatId);

    const history =
        users[chatId].orders.length === 0
            ? '_No orders yet_'
            : users[chatId].orders
                  .slice(-5)
                  .reverse()
                  .map(o =>
                      `• ${o.product} – ${o.grams}g – $${o.cash} – *${o.status}*`
                  )
                  .join('\n');

    const caption = `${HEADER}
👤 *User Profile*

🎚 Level: *${users[chatId].level}*
📊 XP: ${xpBar(users[chatId].xp, users[chatId].level)}

📦 *Recent Orders*
${history}

${COMMANDS_TEXT}`;

    try {
        const photos = await bot.getUserProfilePhotos(chatId, { limit: 1 });
        if (photos.total_count > 0) {
            const fileId = photos.photos[0].pop().file_id;
            return sendCleanPhoto(chatId, fileId, { caption, parse_mode: 'Markdown' });
        }
    } catch {}

    sendCleanMessage(chatId, caption, { parse_mode: 'Markdown' });
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
    const chatId = q.message.chat.id;
    if (isRateLimited(chatId)) return;

    const msgId = q.message.message_id;
    const data = q.data;

    ensureUser(chatId);
    if (!sessions[chatId]) sessions[chatId] = {};
    const s = sessions[chatId];

    if (data.startsWith('product_')) {
        s.product = data.replace('product_', '');
        s.step = 'amount';

        bot.editMessageText(
            `${HEADER}
🌿 *${s.product}*
▫️ Minimum: *2g*
▫️ Price: *$10/g*

✏️ Send grams or $ amount`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
        );
        return;
    }

    if (data === 'confirm_order') {
        if (s.locked) return;
        s.locked = true;

        const order = {
            product: s.product,
            grams: s.grams,
            cash: s.cash,
            status: 'Pending',
            time: Date.now()
        };

        users[chatId].orders.push(order);
        users[chatId].orders = users[chatId].orders.slice(-10);
        saveUsersDebounced();

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
📊 ${xpBar(users[chatId].xp, users[chatId].level)}
${leveled ? '\n🎉 *LEVEL UP!*' : ''}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (data.startsWith('admin_')) {
        const [, action, userId] = data.split('_');
        ensureUser(userId);

        const lastOrder = users[userId].orders.at(-1);
        if (lastOrder) lastOrder.status = action === 'accept' ? 'Accepted' : 'Rejected';

        bot.sendMessage(
            userId,
            action === 'accept' ? '✅ *Order Accepted*' : '❌ *Order Rejected*',
            { parse_mode: 'Markdown' }
        );

        saveUsersDebounced();
        sessions[userId] = {};
    }
});

// ================= USER INPUT =================
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
