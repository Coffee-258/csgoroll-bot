const axios = require('axios');

process.on('uncaughtException', function (err) {
    console.error(err);
    console.log("Node NOT Exiting...");
});

const { Webhook, MessageBuilder } = require('discord-webhook-node');
let hook;
let tradeHook;

const IMAGE_URL = 'https://cdn.discordapp.com/avatars/311900941890617344/464e84acf159fc81cdb6d398e464cc8a.webp';


function sendDiscordMessage(message) {
    if (!global.config.send_discord_message) return;
    
    hook.send(message.substring(0, Math.min(1000, message.length))).catch(() => {
        global.logWithoutDiscord("Error sending discord message");
        return false;
    });
}

function sendDiscordTradeMessage(data) {
    let isDeposit = data.depositor.steamId == global.secrets.steam_id;
    if (data.tradeItems == null) return;

    let item = data.tradeItems[0];


    try {
        const embed = new MessageBuilder()
            .setTitle(isDeposit ? 'New Deposit' : 'New Withdraw')
            .setColor('#F7ABBC')
            .addField('Item', item.itemVariant.externalId, false)
            .addField('Value', `${item.value}`, true)
            .addField('Markup', `${item.markupPercent}%`, true);

        if (item.itemVariant.iconUrl != null) {
            embed.setThumbnail(`${item.itemVariant.iconUrl}`)
        }

        tradeHook.send(embed).catch(() => {
            global.logWithoutDiscord("Error sending discord message");
            return false;
        });
    } catch (e) {
        console.log("Error sending discord message", e);
    }
}

function setupDiscordHook() {
    console.log("Setting up discord hook as Bot");
    hook = new Webhook(global.config.discord_debug_webhook);
    hook.setUsername('Bot');
    hook.setAvatar(IMAGE_URL);

    tradeHook = new Webhook(global.config.discord_webhook);
    tradeHook.setUsername('Bot');
    tradeHook.setAvatar(IMAGE_URL);
}

module.exports = {
    sendDiscordMessage,
    setupDiscordHook,
    sendDiscordTradeMessage
};