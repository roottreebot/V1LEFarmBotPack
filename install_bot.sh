#!/bin/bash
set -e
echo "=== Installing V1LEFarm Bot (GitHub-safe) ==="

# --- Check environment variables ---
if [ -z "$BOT_TOKEN" ]; then
  echo "ERROR: Set BOT_TOKEN first (export BOT_TOKEN=...)"
  exit 1
fi

if [ -z "$ADMIN_IDS" ]; then
  echo "ERROR: Set ADMIN_IDS first (export ADMIN_IDS=123,456)"
  exit 1
fi

# --- Install dependencies ---
echo "Installing Node.js, Git, curl..."
pkg install -y nodejs git curl || apt install -y nodejs git curl
npm install -g pm2

# --- Create bot folder ---
mkdir -p ~/v1lefarm
cd ~/v1lefarm

# --- Fetch bot.js from GitHub ---
BOT_JS_URL="https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bot.js"
curl -L -o bot.js "$BOT_JS_URL"

# --- Inject BOT_TOKEN and ADMIN_IDS ---
ADMIN_ARRAY=$(echo "$ADMIN_IDS" | awk -F',' '{for(i=1;i<=NF;i++) printf "%s%s",$i,(i==NF?"":",")}')
sed -i "s|YOUR_BOT_TOKEN|$BOT_TOKEN|g" bot.js
sed -i "s|YOUR_ADMIN_ID|[$ADMIN_ARRAY]|g" bot.js

# --- Install Node modules ---
if [ ! -f package.json ]; then npm init -y; fi
npm install node-telegram-bot-api

# --- PM2 setup ---
pm2 start bot.js --name v1lefarmbot --watch --max-restarts 100 --restart-delay 2000
pm2 save

echo "✅ Installation complete!"
echo "Bot folder: ~/v1lefarm"
echo "Start/stop/restart with pm2: pm2 start|stop|restart v1lefarmbot"
echo "View logs: pm2 logs v1lefarmbot"
