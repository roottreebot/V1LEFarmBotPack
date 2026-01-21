RUN THIS OR MAKE SIMILAR REMAKE FOR DIFFERENT TERMINAL:

## // SUPPORTS ● TERMUX

export BOT_TOKEN="bot.token.here"
export ADMIN_IDS="ChatID.here,If.More"

bash -c "$(curl -s https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bootstrap.sh)"

3. Check logs:
   pm2 logs v1lefarmbot

## // FILES
bot.js — main bot script

## 1
install_bot.sh — installer

bootstrap.sh — initial bootstrap

## 2
package.json — Node.js dependencies

user.json - users

gitignore — ignored files

meta.json - meta
