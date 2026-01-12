const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;

const ADMIN_SECRET = 'CHANGE_THIS_TO_THE_SAME_SECRET';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ================= TOKEN VERIFY ================= */

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [userId, time, sig] = decoded.split(':');

    const expected = crypto
      .createHmac('sha256', ADMIN_SECRET)
      .update(`${userId}:${time}`)
      .digest('hex');

    if (sig !== expected) return null;
    return userId;
  } catch {
    return null;
  }
}

/* ================= DATA ================= */

const usersPath = path.join(__dirname, '..', 'data', 'users.json');

function loadUsers() {
  return JSON.parse(fs.readFileSync(usersPath, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

/* ================= AUTH GATE ================= */

app.get('/login', (req, res) => {
  const uid = verifyToken(req.query.token);
  if (!uid) return res.status(403).send('Unauthorized');

  res.redirect(`/index.html?uid=${uid}`);
});

/* ================= API ================= */

app.get('/api/users', (req, res) => {
  res.json(loadUsers());
});

/* ===== ADMIN ACTIONS ===== */

app.post('/api/user/ban', (req, res) => {
  const { id } = req.body;
  const users = loadUsers();
  if (!users[id]) return res.sendStatus(404);

  users[id].banned = true;
  saveUsers(users);
  res.sendStatus(200);
});

app.post('/api/user/unban', (req, res) => {
  const { id } = req.body;
  const users = loadUsers();
  if (!users[id]) return res.sendStatus(404);

  users[id].banned = false;
  saveUsers(users);
  res.sendStatus(200);
});

app.post('/api/user/vip', (req, res) => {
  const { id, vip } = req.body;
  const users = loadUsers();
  if (!users[id]) return res.sendStatus(404);

  users[id].vip = vip;
  if (!users[id].roles) users[id].roles = [];

  if (vip && !users[id].roles.includes('VIP')) {
    users[id].roles.push('VIP');
  }

  if (!vip) {
    users[id].roles = users[id].roles.filter(r => r !== 'VIP');
  }

  saveUsers(users);
  res.sendStatus(200);
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`🛠 Admin Panel → http://localhost:${PORT}`);
});
