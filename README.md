![imagealt](https://github.com/v1ledev/V1LEFarmBotPack/blob/e2e2db0791213986c670dfb6ef9cbe02d61dcc63/img/cropped_circle_image%20(8).png)

## NOTE
RUN THIS OR MAKE SIMILAR REMAKE FOR DIFFERENT TERMINAL:

## // SUPPORTS ● TERMUX
![imagealt](https://github.com/v1ledev/V1LEFarmBotPack/blob/24dae9df139ca79342d38e49892acec30de3c048/img/Termux.logo.svg)

export BOT_TOKEN="bot.token.here"
export ADMIN_IDS="ChatID.here,If.More"

bash -c "$(curl -s https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bootstrap.sh)"

## PM2 CMDS:
![imagealt](https://github.com/v1ledev/V1LEFarmBotPack/blob/b989fd5b28a5aabae66826120eb8bf4614b6b213/img/pm2-logo-1.webp)
   
   pm2 logs v1lefarmbot,
   pm2 start v1lefarmbot,
   pm2 stop v1lefarmbot,
   pm2 update v1lefarmbot,

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
