#!/bin/bash
set -e

pkg update -y || apt update -y
pkg upgrade -y || apt upgrade -y
pkg install -y nodejs git curl || apt install -y nodejs git curl
npm install -g pm2

cd ~
rm -rf V1LEFarmBot
git clone https://github.com/YOUR_USERNAME/V1LEFarmBot.git
cd V1LEFarmBot

bash install_bot.sh
