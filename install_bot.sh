#!/bin/bash
set -e
echo "=== Installing V1LEFarm Bot ==="

if [ ! -f ".env" ]; then
  echo "ERROR: .env file not found! Copy .env.example to .env and fill values."
  exit 1
fi

npm install
pm2 delete v1lefarmbot || true
pm2 start bot.js --name v1lefarmbot
pm2 save

echo "✅ Bot installed & started."
