#!/bin/bash

# --- Change this to your bot folder path ---
BOT_DIR="/path/to/your/V1LEFarmBot"

echo "📁 Navigating to bot directory..."
cd "$BOT_DIR" || exit

echo "🔄 Pulling latest code from GitHub..."
git fetch --all
git reset --hard origin/main  # or 'origin/master' depending on your branch

echo "📦 Installing/updating dependencies..."
npm install

echo "🔁 Restarting bot with PM2..."
pm2 restart V1LEFarmBot

echo "✅ Bot updated and restarted successfully!"
