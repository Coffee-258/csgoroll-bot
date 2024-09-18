// Require the necessary discord.js classes
const { Message, Client, Events, GatewayIntentBits, ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder, InteractionType, InteractionReplyOptions } = require('discord.js');
const token = "token";
let userId = global.config.discord_user_id;

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let _user;

let actions = {};

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, readyClient => {
    console.log(`Discord bot ready`);

    client.users.fetch(userId)
        .then(async user => {
            _user = user;

            const dmChannel = await user.createDM();

            client.channels.fetch(dmChannel.id).then(async channel => {
                const messages = await channel.messages.fetch({
                    limit: 100
                });

                for (let msg of messages.values()) {
                    try {
                        msg.delete();
                    } catch(e) {
                        console.log("Old DM with discord bot couldn't be deleted");
                    }
                }
            });
        });
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.type !== InteractionType.MessageComponent) return; // Check for button interaction

    await interaction.deferReply();

    const { customId } = interaction;

    let action = customId.split("-")[0];
    let tradeId = customId.split("-")[1];

    let a =  actions[tradeId];
    actions[tradeId] = null;

    if (action == "accept") {
        a.accept(() => {
            interaction.editReply("Steam trade accepted.").then(() => {
                //Delete message after 10 seconds
                setTimeout(() => {
                    interaction.deleteReply().then(() => {
                        interaction.message.delete()
                        .catch((err) => {
                            //just dont crash;
                        });
                    })
                }, 10000);
            });
        });
    } else {
        a.decline(() => {
            interaction.editReply("Steam trade declined.")
            .then(() => {
                //Delete message after 10 seconds
                setTimeout(() => {
                    interaction.deleteReply().then(() => {
                        interaction.message.delete()
                        .catch((err) => {
                            //just dont crash;
                        });
                    })
                }, 10000);
            });
        });
    }
});

// Log in to Discord with your client's token
client.login(token);

function sendTradeDialog(tradeDetails) {

    actions[tradeDetails.tradeId] = {
        accept: tradeDetails.acceptAction,
        decline: tradeDetails.declineAction
    }

    const confirmButton = new ButtonBuilder()
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success)
        .setCustomId("accept-" + tradeDetails.tradeId);

    const declineButton = new ButtonBuilder()
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
        .setCustomId("decline-" + tradeDetails.tradeId);

    const row = new ActionRowBuilder().addComponents(confirmButton).addComponents(declineButton);

    const embed = new EmbedBuilder()
        .setTitle("Incoming trade offer")
        .setDescription(tradeDetails.name)
        .setTimestamp(new Date())
        .addFields(
            { name: 'FLOAT', value: "" + tradeDetails.float, inline: true },
            { name: 'PRICE', value: "" + tradeDetails.price, inline: true },
            { name: 'MARKUP', value: "" + tradeDetails.markup + '%', inline: true },
        )
        if(!tradeDetails.priceAccurate) {
            embed.addFields(
                {name: '\u200b', value: "⚠️ Price might be inaccurate"}
            );
        }
        embed.addFields(
            { name: '%BUFF163', value: tradeDetails.buffPercent + "%", inline: true },
            { name: 'BUFF163-USD', value: tradeDetails.buffUSD + "$", inline: true },
            { name: 'ROLL-USD', value: tradeDetails.rollUSD + "$", inline: true },
        );

    if (tradeDetails.icon != null && tradeDetails.icon != "NULL") {
        embed.setThumbnail(tradeDetails.icon);
    }

    _user.send({
        embeds: [embed],
        components: [row]
    }).then((message) => {
        console.log(`Sent discord trade message`);

        //Delete message after 15 minutes
        setTimeout(() => {
            message.delete()
                .catch((err) => {
                    //just dont crash;
                });
        }, 15 * 60 * 1000);
    }).catch(console.error);
}

module.exports = {
    sendTradeDialog
}