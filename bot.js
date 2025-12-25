== V1LE FARM BOT (FINAL – MOBILE FRIENDLY, FULL FEATURES) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ BOT_TOKEN or ADMIN_IDS missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const BOT_START_TIME = Date.now();

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';
const FEEDBACK_FILE = 'feedback.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE)) : { weeklyReset: Date.now(), storeOpen: true };
let feedback = fs.existsSync(FEEDBACK_FILE) ? JSON.parse(fs.readFileSync(FEEDBACK_FILE)) : [];

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2));
}

// ================= USERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false,
      username: username || '',
      lastOrderAt: 0,
      roles: [],
      lastDaily: 0,
      dailyStreak: 0,
      lastSlot: 0
    };
  }
  if (username) users[id].username = username;
}

function giveXP(id, xp) {
  const u = users[id];
  if (!u || u.banned) return;
  u.xp += xp;
  u.weeklyXp += xp;
  while (u.xp >= u.level * 5) { u.xp -= u.level * 5; u.level++; }
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.floor((xp / max) * 10);
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

function streakText(u) {
  if (!u || !u.dailyStreak || u.dailyStreak < 1) return '🔥 Daily Streak: 0';
  return `🔥 Daily Streak: ${u.dailyStreak} day${u.dailyStreak === 1 ? '' : 's'}`;
}

// ================= PRODUCTS & ROLE SHOP =================
const PRODUCTS = { 'Jacky Ds': { price: 10 }, 'Killer Green Budz': { price: 10 } };
const ROLE_SHOP = {"🌟 Novice":{price:50},"🌀 Initiate":{price:50},"🔥 Apprentice":{price:100},"💎 Adept":{price:200}};

function getHighestRole(user){
  if(!user.roles || !user.roles.length) return "_No role_";
  let highest = "_No role_";
  for(const role of Object.keys(ROLE_SHOP)) if(user.roles.includes(role)) highest=role;
  return highest;
}

// ================= SLOTS =================
const SLOT_COOLDOWN = 10*1000;
const SLOT_SYMBOLS = ['🍒','🍋','🍊','🍉','⭐'];
const ULTRA_SYMBOL='💎';
const ULTRA_CHANCE=0.03;
function spinReel(){return Math.random()<ULTRA_CHANCE?ULTRA_SYMBOL:SLOT_SYMBOLS[Math.floor(Math.random()*SLOT_SYMBOLS.length)];}

// ================= MAIN MENU =================
const sessions={};
async function sendOrEdit(id,text,opt={}){
  if(!sessions[id]) sessions[id]={};
  const mid=sessions[id].mainMsgId;
  if(mid){
    try{await bot.editMessageText(text,{chat_id:id,message_id:mid,...opt});return;}catch{sessions[id].mainMsgId=null;}
  }
  const m=await bot.sendMessage(id,text,opt);
  sessions[id].mainMsgId=m.message_id;
}

async function showMainMenu(id){
  ensureUser(id);
  const u=users[id];
  const highestRole=getHighestRole(u);
  let orders=u.orders.length?u.orders.map(o=>`${o.status==='✅ Accepted'?'🟢':'⚪'} *${o.product}* — ${o.grams||0}g — $${o.cash||0} — *${o.status}*`).join('\n'):'_No orders yet_';
  let kb=Object.keys(PRODUCTS).map(p=>[{text:`🪴 ${p}`,callback_data:`product_${p}`}]);
  if(ADMIN_IDS.includes(id)){kb.push([{text:meta.storeOpen?'🔴 Close Store':'🟢 Open Store',callback_data:meta.storeOpen?'store_close':'store_open'}]);}
  await sendOrEdit(id,`${meta.storeOpen?'🟢 Store Open':'🔴 Store Closed'}\n👑 Highest Role: *${highestRole}*\n🎚 Level: *${u.level}*\n📊 XP: ${xpBar(u.xp,u.level)}\n${streakText(u)}\n📦 Orders (last 5)\n${orders}`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:kb}});
}

bot.onText(/\/start|\/help/,msg=>showMainMenu(msg.chat.id));

// ================= CALLBACKS =================
bot.on('callback_query',async q=>{
  const id=q.message.chat.id; ensureUser(id,q.from.username); const s=sessions[id]||(sessions[id]={});
  await bot.answerCallbackQuery(q.id).catch(()=>{});
  if(q.data==='reload') return showMainMenu(id);
  if(q.data==='store_open' && ADMIN_IDS.includes(id)){meta.storeOpen=true; saveAll(); return showMainMenu(id);}
  if(q.data==='store_close' && ADMIN_IDS.includes(id)){meta.storeOpen=false; saveAll(); return showMainMenu(id);}
  if(q.data.startsWith('product_')){
    if(!meta.storeOpen) return bot.answerCallbackQuery(q.id,{text:'🛑 Store is closed!',show_alert:true});
    if(Date.now()-(s.lastClick||0)<30000) return bot.answerCallbackQuery(q.id,{text:'Please wait before clicking again',show_alert:true});
    s.lastClick=Date.now(); s.product=q.data.replace('product_',''); s.step='amount';
    return sendOrEdit(id,`✏️ Send grams or $ amount for *${s.product}*`);
  }
});

// ================= USER MESSAGES =================
bot.on('message',msg=>{
  const id=msg.chat.id; ensureUser(id,msg.from.username); const s=sessions[id];
  if(!s || s.step!=='amount') return;
  const text=msg.text?.trim(); if(!text) return;
  const price=PRODUCTS[s.product].price;
  let grams,cash;
  if(text.startsWith('$')){cash=parseFloat(text.slice(1)); grams=+(cash/price).toFixed(1);} else {grams=Math.round(parseFloat(text)*2)/2; cash=+(grams*price).toFixed(2);}
  if(!grams || grams<2) return;
  s.grams=grams; s.cash=cash;
  sendOrEdit(id,`🧾 *Order Summary*\n🌿 *${s.product}*\n⚖️ ${grams}g\n💲 $${cash}`,{reply_markup:{inline_keyboard:[[{text:'✅ Confirm',callback_data:'confirm_order'}],[{text:'🏠 Back to Menu',callback_data:'reload'}]]},parse_mode:'Markdown'});
});

// ================= /profile =================
bot.onText(/\/profile/,msg=>{
  const id=msg.chat.id; const uid=msg.from.id; ensureUser(uid,msg.from.username);
  const u=users[uid];
  bot.sendMessage(id,`👤 *User Profile*\n🆔 ID: \`${uid}\`\n👑 Level: *${u.level}*\n📊 XP: ${xpBar(u.xp,u.level)}\n📅 Weekly XP: *${u.weeklyXp}*\n🔥 Daily Streak: ${u.dailyStreak || 0}\n📦 Orders: *${u.orders?.length || 0}*\n🚫 Banned: *${u.banned?'Yes':'No'}*`,{parse_mode:'Markdown'});
});

// ================= /daily =================
bot.onText(/\/daily/,msg=>{
  const id=msg.chat.id; ensureUser(id,msg.from.username);
  const u=users[id]; const now=Date.now();
  if(now-u.lastDaily<24*60*60*1000) return bot.sendMessage(id,`❌ You have already claimed daily. Next in ${(24*60*60*1000-(now-u.lastDaily))/3600000}h`);
  if(now-u.lastDaily<48*60*60*1000){u.dailyStreak++;} else {u.dailyStreak=1;}
  u.lastDaily=now; const reward=10+u.dailyStreak*2; giveXP(id,reward); saveAll(); bot.sendMessage(id,`✅ Daily claimed! +${reward} XP\n🔥 Current streak: ${u.dailyStreak} day${u.dailyStreak===1?'':'s'}`);
});

// ================= /userprofile =================
bot.onText(/\/userprofile\s+@?(\w+)/,msg=>{
  const id=msg.chat.id; const uname=msg.match[1].toLowerCase();
  const uid=Object.keys(users).find(k=>users[k].username?.toLowerCase()===uname);
  if(!uid) return bot.sendMessage(id,'❌ User not found');
  const u=users[uid];
  bot.sendMessage(id,`👤 *User Profile*\n🆔 ID: \`${uid}\`\n👑 Level: *${u.level}*\n📊 XP: ${xpBar(u.xp,u.level)}\n📅 Weekly XP: *${u.weeklyXp}*\n🔥 Daily Streak: ${u.dailyStreak || 0}\n📦 Orders: *${u.orders?.length || 0}*\n🚫 Banned: *${u.banned?'Yes':'No'}*`,{parse_mode:'Markdown'});
});

// ================= EXPORT/IMPORT =================
bot.onText(/\/exportdb/,msg=>{if(!ADMIN_IDS.includes(msg.chat.id)) return; bot.sendDocument(msg.chat.id,DB_FILE);});
bot.onText(/\/importdb/,msg=>{if(!ADMIN_IDS.includes(msg.chat.id)) return; const file=DB_FILE; if(fs.existsSync(file)){users=JSON.parse(fs.readFileSync(file)); saveAll(); bot.sendMessage(msg.chat.id,'✅ DB imported');}});
