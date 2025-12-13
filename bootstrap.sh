#!/bin/bash
set -e

pkg update -y || apt update -y
pkg upgrade -y || apt upgrade -y

pkg install -y nodejs git curl || apt install -y nodejs git curl
npm install -g pm2

cd ~
rm -rf v1lefarm
git clone https://github.com/roottreebot/V1LEFarmBotPack.git v1lefarm
cd v1lefarm

bash install_bot.sh
