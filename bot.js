// === V1LE FARM BOT (FINAL FULL MERGED VERSION) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('BOT_TOKEN or ADMIN_IDS missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : {
      storeOpen: true,
      weeklyReset: Date.now(),
      totalMoney: 0,
      totalOrders: 0
    };

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ================= USERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      username: username || '',
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false
    };
  }
  if (username) users[id].username = username;
}

// ================= XP =================
function giveXP(id, xp) {
  const u = users[id];
  if (!u) return;

  u.xp += xp;
  u.weeklyXp += xp;

  while (u.xp >= u.level * 5) {
    u.xp -= u.level * 5;
    u.level++;
  }
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.min(10, Math.floor((xp / max) * 10));
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill);
}

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= SESSIONS =================
const sessions = {};

// ================= MAIN MENU =================
async function showMainMenu(id, page = 0) {
  ensureUser(id);

  const u = users[id];
  const orders = u.orders.length
    ? u.orders.map(o => `• ${o.product} — ${o.grams}g — $${o.cash} — ${o.status}`).join('\n')
    : '_No orders_';

  const lb = getLeaderboard(page);

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    lb.buttons[0],
    [{ text: '🔄 Reload Menu', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([{ text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store', callback_data: 'toggle_store' }]);
    kb.push([{ text: '📊 Stats', callback_data: 'stats_refresh' }]);
  }

  const text = `
${meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}

🎚 Level: ${u.level}
📊 XP: ${xpBar(u.xp, u.level)}

📦 Your Orders (last 5)
${orders}

${lb.text}
`;

  const s = sessions[id] ||= {};
  if (s.mainMsg) {
    await bot.editMessageText(text, {
      chat_id: id,
      message_id: s.mainMsg,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: kb }
    }).catch(() => {});
  } else {
    const m = await bot.sendMessage(id, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: kb }
    });
    s.mainMsg = m.message_id;
  }
}

// ================= LEADERBOARD =================
function getLeaderboard(page = 0) {
  const size = 5;
  const list = Object.entries(users)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const slice = list.slice(page * size, page * size + size);
  let text = `📊 Weekly Leaderboard\n`;
  slice.forEach(([id, u], i) => {
    text += `#${page * size + i + 1} @${u.username || id} — Lv ${u.level} — XP ${u.weeklyXp}\n`;
  });

  return {
    text,
    buttons: [[
      { text: '⬅ Prev', callback_data: `lb_${page - 1}` },
      { text: '➡ Next', callback_data: `lb_${page + 1}` }
    ]]
  };
}

// ================= START =================
bot.onText(/\/start|\/help/, msg => showMainMenu(msg.chat.id));

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const s = sessions[id] ||= {};
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (q.data === 'reload') return showMainMenu(id);
  if (q.data.startsWith('lb_')) return showMainMenu(id, Math.max(0, Number(q.data.split('_')[1])));

  if (q.data === 'toggle_store' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = !meta.storeOpen;
    saveAll();
    return showMainMenu(id);
  }

  // ===== STATS =====
  if (q.data === 'stats_refresh') {
    return bot.sendMessage(id,
      `💰 Total Money: $${meta.totalMoney}\n📦 Total Orders: ${meta.totalOrders}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'stats_refresh' }],
            [{ text: '♻ Reset Stats', callback_data: 'stats_reset' }]
          ]
        }
      }
    );
  }

  if (q.data === 'stats_reset' && ADMIN_IDS.includes(id)) {
    meta.totalMoney = 0;
    meta.totalOrders = 0;
    saveAll();
    return bot.answerCallbackQuery(q.id, { text: 'Stats reset' });
  }

  // ===== PRODUCTS =====
  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen)
      return bot.answerCallbackQuery(q.id, { text: 'Store closed', show_alert: true });

    const pending = users[id].orders.filter(o => o.status === 'Pending').length;
    if (pending >= 2)
      return bot.answerCallbackQuery(q.id, { text: 'Max 2 pending orders', show_alert: true });

    s.product = q.data.replace('product_', '');
    s.step = 'amount';
    return bot.sendMessage(id, `Send grams or $ amount for ${s.product}`);
  }

  // ===== CONFIRM =====
  if (q.data === 'confirm_order') {
    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: 'Pending',
      adminMsgs: []
    };

    users[id].orders.push(order);
    users[id].orders = users[id].orders.slice(-5);
    saveAll();

    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(admin,
        `🧾 NEW ORDER\n@${users[id].username || id}\n${order.product} — ${order.grams}g — $${order.cash}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Accept', callback_data: `admin_accept_${id}_${users[id].orders.length - 1}` },
              { text: '❌ Reject', callback_data: `admin_reject_${id}_${users[id].orders.length - 1}` }
            ]]
          }
        }
      );
      order.adminMsgs.push({ admin, msgId: m.message_id });
    }

    return showMainMenu(id);
  }

  // ===== ADMIN ACCEPT / REJECT =====
  if (q.data.startsWith('admin_')) {
    const [, action, uid, idx] = q.data.split('_');
    const order = users[uid]?.orders[idx];
    if (!order || order.status !== 'Pending') return;

    order.status = action === 'accept' ? 'Accepted' : 'Rejected';

    if (action === 'accept') {
      meta.totalMoney += Number(order.cash);
      meta.totalOrders += 1;
      giveXP(uid, Math.floor(order.cash / 2));
    }

    for (const m of order.adminMsgs) {
      bot.editMessageText(
        `🧾 ORDER ${order.status}\n${order.product} — ${order.grams}g — $${order.cash}`,
        { chat_id: m.admin, message_id: m.msgId }
      ).catch(() => {});
    }

    saveAll();
    return showMainMenu(Number(uid));
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  const s = sessions[id];
  if (!s || s.step !== 'amount') return;

  const price = PRODUCTS[s.product].price;
  let grams, cash;

  if (msg.text.startsWith('$')) {
    cash = Number(msg.text.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Number(msg.text);
    cash = +(grams * price).toFixed(2);
  }

  s.grams = grams;
  s.cash = cash;
  s.step = null;

  bot.sendMessage(id,
    `🧾 Order Summary\n${s.product}\n${grams}g — $${cash}`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: '✅ Confirm', callback_data: 'confirm_order' }]]
      }
    }
  );
});
