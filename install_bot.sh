#!/bin/bash
set -e
echo "=== Installing V1LEFarm Bot ==="

if [ -z "$BOT_TOKEN" ]; then echo "ERROR: Set BOT_TOKEN first"; exit 1; fi
if [ -z "$ADMIN_IDS" ]; then echo "ERROR: Set ADMIN_IDS first"; exit 1; fi

# Install dependencies
pkg install -y nodejs git curl || apt install -y nodejs git curl
npm install -g pm2

# Bot folder
mkdir -p ~/v1lefarm && cd ~/v1lefarm

# Download bot.js
curl -L -o bot.js https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bot.js

# Node.js setup
npm init -y
npm install node-telegram-bot-api

# Start with PM2
pm2 start bot.js --name v1lefarmbot --watch --max-restarts 100
pm2 save

echo "✅ Installation complete"
