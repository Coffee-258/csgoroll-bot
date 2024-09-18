const crypto = require('crypto');

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

function cleanupMarketname(marketName) {
    if (marketName.indexOf("Doppler") >= 0) {
        const regex = /Phase [1-9] /gm;

        marketName = marketName.replace(regex, "");
    }

    if (isKnife(marketName)) {
        if (marketName.includes("Ruby")) {
            marketName = marketName.replace("Ruby", "Doppler");
        }

        if (marketName.includes("Sapphire")) {
            marketName = marketName.replace("Sapphire", "Doppler");
        }

        if (marketName.includes("Black Pearl")) {
            marketName = marketName.replace("Black Pearl", "Doppler");
        }

        if (marketName.includes("Emerald")) {
            marketName = marketName.replace("Emerald", "Gamma Doppler");
        }
    }

    return marketName;
}

function isKnife(name) {
    if (name.includes("Bowie Knife")) return true;
    if (name.includes("Bayonet")) return true;
    if (name.includes("Shadow Daggers")) return true;
    if (name.includes("Falchion Knife")) return true;
    if (name.includes("Nomad Knife")) return true;
    if (name.includes("Butterfly Knife")) return true;
    if (name.includes("Gut Knife")) return true;
    if (name.includes("Flip Knife")) return true;
    if (name.includes("Karambit")) return true;
    if (name.includes("Talon Knife")) return true;
    if (name.includes("Stiletto Knife")) return true;
    if (name.includes("Navaja Knife")) return true;
    if (name.includes("Huntsman Knife")) return true;
    if (name.includes("Ursus Knife")) return true;
    if (name.includes("Paracord Knife")) return true;
    if (name.includes("Survival Knife")) return true;
    return false;
}

function createLabelFromTradeData(trade, fullTrade) {
    let name = fullTrade != null ? fullTrade.tradeItems[0].itemVariant.externalId : trade.itemName;
    return `${name} ${trade.totalValue ?? fullTrade.totalValue}C + ${trade.markupPercent ?? fullTrade.markupPercent} %`;
}

module.exports = {
    cleanupMarketname,
    createLabelFromTradeData,
    uuidv4
}