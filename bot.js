// === V1LE FARM BOT – FULLY MERGED, MOBILE FRIENDLY, FULL FEATURES ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ===== CONFIG =====
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];
const BOT_START_TIME = Date.now();
const DATA_FILE = './botdata.json';

// ===== INITIAL DATA =====
let users = {};
let orders = [];
let feedbacks = [];
let bannedUsers = [];
let weeklyReset = {};

// Load data from file
if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE);
    const json = JSON.parse(raw);
    users = json.users || {};
    orders = json.orders || [];
    feedbacks = json.feedbacks || [];
    bannedUsers = json.bannedUsers || [];
    weeklyReset = json.weeklyReset || {};
}

// Save data
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users, orders, feedbacks, bannedUsers, weeklyReset }, null, 2));
}

// ===== HELPER FUNCTIONS =====
function ensureUser(id, username) {
    if (!users[id]) {
        users[id] = { username, balance: 0, streak: 0, totalOrders: 0, rank: 0 };
        saveData();
    } else {
        users[id].username = username; // update username
        saveData();
    }
}

function formatCurrency(amount) {
    return `$${amount}`;
}

function getLeaderboard() {
    return Object.entries(users)
        .sort((a, b) => b[1].balance - a[1].balance)
        .slice(0, 5)
        .map(([id, u], i) => `${i + 1}. ${u.username || 'Unknown'} - ${formatCurrency(u.balance)}`)
        .join('\n') || 'No users yet';
}

function getLastOrders() {
    return orders.slice(-5).reverse().map((o, i) => `${i + 1}. ${o.username}: ${o.item}`).join('\n') || 'No orders yet';
}

function isAdmin(id) {
    return ADMIN_IDS.includes(id);
}

function getStreak(user) {
    return users[user]?.streak || 0;
}

// ===== BOT INIT =====
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== USER COMMANDS =====
bot.onText(/\/start/, (msg) => {
    const id = msg.chat.id;
    ensureUser(id, msg.from.username);
    const streak = getStreak(id);
    bot.sendMessage(id, `Welcome ${msg.from.username}!\nYour current streak: ${streak}\nTop 5 leaderboard:\n${getLeaderboard()}\nLast 5 orders:\n${getLastOrders()}`);
});

// /profile
bot.onText(/\/profile/, (msg) => {
    const id = msg.chat.id;
    ensureUser(id, msg.from.username);
    const u = users[id];
    bot.sendMessage(id, `📊 Profile: ${u.username}\nBalance: ${formatCurrency(u.balance)}\nTotal Orders: ${u.totalOrders}\nStreak: ${u.streak}`);
});

// /userprofile @username
bot.onText(/\/userprofile (.+)/, (msg, match) => {
    const id = msg.chat.id;
    const targetName = match[1].replace('@', '');
    const target = Object.values(users).find(u => u.username === targetName);
    if (!target) return bot.sendMessage(id, 'User not found.');
    bot.sendMessage(id, `📊 Profile: ${target.username}\nBalance: ${formatCurrency(target.balance)}\nTotal Orders: ${target.totalOrders}\nStreak: ${target.streak}`);
});

// /daily
bot.onText(/\/daily/, (msg) => {
    const id = msg.chat.id;
    ensureUser(id, msg.from.username);
    const today = new Date().toDateString();
    if (users[id].lastDaily === today) return bot.sendMessage(id, 'You have already claimed your daily reward today!');
    users[id].lastDaily = today;
    users[id].balance += 100;
    users[id].streak = (users[id].streak || 0) + 1;
    saveData();
    bot.sendMessage(id, `You claimed your daily $100 reward!\nCurrent streak: ${users[id].streak}`);
});

// /feedback
bot.onText(/\/feedback (.+)/, (msg, match) => {
    const id = msg.chat.id;
    const text = match[1];
    feedbacks.push({ user: msg.from.username, text, date: new Date().toISOString() });
    saveData();
    bot.sendMessage(id, 'Feedback submitted successfully!');
});

// /clear
bot.onText(/\/clear/, (msg) => {
    const id = msg.chat.id;
    ensureUser(id, msg.from.username);
    users[id].balance = 0;
    users[id].streak = 0;
    users[id].totalOrders = 0;
    saveData();
    bot.sendMessage(id, 'Your profile has been cleared.');
});

// ===== ADMIN COMMANDS =====

// /exportdb
bot.onText(/\/exportdb/, (msg) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    bot.sendDocument(id, DATA_FILE);
});

// /importdb
bot.onText(/\/importdb/, (msg) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    bot.sendMessage(id, 'Please send the JSON file to import.');
});

// /ban @username
bot.onText(/\/ban (.+)/, (msg, match) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    const targetName = match[1].replace('@', '');
    const target = Object.entries(users).find(([uid, u]) => u.username === targetName);
    if (!target) return bot.sendMessage(id, 'User not found.');
    bannedUsers.push(target[0]);
    saveData();
    bot.sendMessage(id, `${targetName} has been banned.`);
});

// /unban @username
bot.onText(/\/unban (.+)/, (msg, match) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    const targetName = match[1].replace('@', '');
    const target = Object.entries(users).find(([uid, u]) => u.username === targetName);
    if (!target) return bot.sendMessage(id, 'User not found.');
    bannedUsers = bannedUsers.filter(u => u !== target[0]);
    saveData();
    bot.sendMessage(id, `${targetName} has been unbanned.`);
});

// /broadcast
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    const text = match[1];
    Object.keys(users).forEach(uid => {
        bot.sendMessage(uid, `📢 Broadcast:\n${text}`);
    });
});

// /banlist
bot.onText(/\/banlist/, (msg) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    const list = bannedUsers.map(u => users[u]?.username || u).join('\n') || 'No banned users.';
    bot.sendMessage(id, `🚫 Banned Users:\n${list}`);
});

// /resetweekly
bot.onText(/\/resetweekly/, (msg) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    Object.values(users).forEach(u => u.streak = 0);
    weeklyReset.last = new Date().toISOString();
    saveData();
    bot.sendMessage(id, 'Weekly streaks reset.');
});

// /activeusers
bot.onText(/\/activeusers/, (msg) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    const list = Object.values(users).map(u => u.username).join('\n') || 'No active users.';
    bot.sendMessage(id, `Active Users:\n${list}`);
});

// /userfeedback
bot.onText(/\/userfeedback/, (msg) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    const list = feedbacks.map(f => `${f.user}: ${f.text}`).join('\n') || 'No feedback yet.';
    bot.sendMessage(id, `User Feedbacks:\n${list}`);
});

// /clearfeedback
bot.onText(/\/clearfeedback/, (msg) => {
    const id = msg.chat.id;
    if (!isAdmin(id)) return;
    feedbacks = [];
    saveData();
    bot.sendMessage(id, 'All feedback cleared.');
});

// /uptime
bot.onText(/\/uptime/, (msg) => {
    const id = msg.chat.id;
    const diff = Date.now() - BOT_START_TIME;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    bot.sendMessage(id, `Bot uptime: ${hours}h ${minutes}m`);
});

// ===== SHOP SYSTEM =====
const ROLE_SHOP = {
    VIP: { price: 500 },
    PREMIUM: { price: 1000 }
};

bot.onText(/\/shop/, (msg) => {
    const id = msg.chat.id;
    ensureUser(id, msg.from.username);
    const opts = {
        reply_markup: {
            inline_keyboard: Object.keys(ROLE_SHOP).map(role => [{
                text: `${role} ($${ROLE_SHOP[role].price})`,
                callback_data: `buy_${role}`
            }])
        }
    };
    bot.sendMessage(id, '🛒 Shop:', opts);
});

bot.on('callback_query', (q) => {
    const id = q.message.chat.id;
    ensureUser(id, q.from.username);
    const data = q.data;
    if (data.startsWith('buy_')) {
        const role = data.split('_')[1];
        const price = ROLE_SHOP[role].price;
        if (users[id].balance < price) return bot.answerCallbackQuery(q.id, { text: 'Not enough balance!' });
        users[id].balance -= price;
        orders.push({ username: users[id].username, item: role, date: new Date().toISOString() });
        users[id].totalOrders += 1;
        saveData();
        bot.answerCallbackQuery(q.id, { text: `You bought ${role}!` });
        bot.sendMessage(id, `✅ You purchased ${role} for $${price}`);
    }
});

// ===== SLOTS SYSTEM =====
const SLOT_COOLDOWN = 10 * 1000;
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍉', '⭐'];
const ULTRA_SYMBOL = '💎';
let lastSlot = {};

bot.onText(/\/slots (\d+)/, (msg, match) => {
    const id = msg.chat.id;
    const amount = parseInt(match[1]);
    ensureUser(id, msg.from.username);
    if (!amount || amount <= 0) return bot.sendMessage(id, 'Invalid bet.');
    if (users[id].balance < amount) return bot.sendMessage(id, 'Not enough balance.');
    const now = Date.now();
    if (lastSlot[id] && now - lastSlot[id] < SLOT_COOLDOWN) return bot.sendMessage(id, 'Cooldown active!');
    lastSlot[id] = now;

    const spin = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
    const result = [spin(), spin(), spin()];
    let win = 0;
    if (result[0] === result[1] && result[1] === result[2]) {
        win = amount * (result[0] === ULTRA_SYMBOL ? 10 : 2);
    }
    users[id].balance += win - amount;
    saveData();
    bot.sendMessage(id, `🎰 ${result.join(' ')}\n${win ? `You won $${win}!` : `You lost $${amount}`}`);
});

// ===== BLACKJACK PLACEHOLDER =====
bot.onText(/\/blackjack (\d+)/, (msg, match) => {
    const id = msg.chat.id;
    const bet = parseInt(match[1]);
    ensureUser(id, msg.from.username);
    if (!bet || bet <= 0) return bot.sendMessage(id, 'Invalid bet.');
    if (users[id].balance < bet) return bot.sendMessage(id, 'Not enough balance.');
    const win = Math.random() < 0.5;
    users[id].balance += win ? bet : -bet;
    saveData();
    bot.sendMessage(id, `🃏 Blackjack: ${win ? `You won $${bet}!` : `You lost $${bet}`}`);
});

// ===== SPIN COMMAND =====
bot.onText(/\/spin/, (msg) => {
    const id = msg.chat.id;
    ensureUser(id, msg.from.username);
    const prizes = [50, 100, 200, 500];
    const prize = prizes[Math.floor(Math.random() * prizes.length)];
    users[id].balance += prize;
    saveData();
    bot.sendMessage(id, `🎡 You spun the wheel and won $${prize}!`);
});

console.log('✅ V1LE FARM BOT is running...');
