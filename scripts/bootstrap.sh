#!/bin/bash
set -e

# ----------------------------
# V1LE FARM BOT SETUP
# ----------------------------

# Check required env vars
if [[ -z "$BOT_TOKEN" ]] || [[ -z "$ADMIN_IDS" ]]; then
  echo "❌ BOT_TOKEN and ADMIN_IDS must be set"
  echo "Example:"
  echo "BOT_TOKEN='TOKEN' ADMIN_IDS='123,456' bash scripts/bootstrap.sh"
  exit 1
fi

echo "📦 Updating packages..."
pkg update -y || apt update -y
pkg upgrade -y || apt upgrade -y

echo "📦 Installing Node.js, Git, Curl..."
pkg install -y nodejs git curl unzip

echo "📦 Installing PM2 globally..."
npm install -g pm2

# Remove old install if exists
rm -rf ~/V1LEFarmBot

echo "📥 Downloading V1LEFarmBotPack..."
cd ~
curl -fsSL https://github.com/roottreebot/V1LEFarmBotPack/archive/refs/heads/main.zip -o V1LEFarmBotPack.zip
unzip -q V1LEFarmBotPack.zip
mv V1LEFarmBotPack-main V1LEFarmBot
rm V1LEFarmBotPack.zip

cd ~/V1LEFarmBot

echo "📦 Installing npm dependencies..."
npm install

echo "🚀 Starting the bot with PM2..."
pm2 delete V1LEFarmBot >/dev/null 2>&1 || true
pm2 start bot/bot.js --name V1LEFarmBot
pm2 save

echo "🎉 Bot is now running!"
echo "Logs:    pm2 logs V1LEFarmBot"
echo "Restart: pm2 restart V1LEFarmBot"
