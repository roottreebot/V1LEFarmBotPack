## NOTE
RUN THIS OR MAKE SIMILAR REMAKE FOR DIFFERENT TERMINAL:

## // SUPPORTS ● TERMUX

export BOT_TOKEN="bot.token.here"
export ADMIN_IDS="ChatID.here,If.More"

bash -c "$(curl -s https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bootstrap.sh)"

## PM2 CMDS:
   pm2 logs v1lefarmbot
   pm2 start v1lefarmbot
   pm2 stop v1lefarmbot
   pm2 update v1lefarmbot

## // FILES
package.json — Node.js dependencies
gitignore — ignored files

## /bot
bot.js — main bot script

## /scripts
install_bot.sh — installer
bootstrap.sh — initial bootstrap

## /config
meta.json - meta
user.json - users
