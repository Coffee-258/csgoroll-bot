function errorInterceptor(apiName) {
    const { sendDiscordMessage } = require("../api/modules/discord.js")

    process.on('uncaughtException', (err) => {
        console.log(`${apiName} crashed! Error: ${err.message}`)
        sendDiscordMessage(`${apiName} crashed! Error: ${err.message}`)

        setTimeout(() => {
            process.exit(1)
        }, 1000)
    })
}

module.exports = errorInterceptor;
