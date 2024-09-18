const axios = require('axios');


const { createLabelFromTradeData } = require('./helpers.js');
const { createTrade } = require('./trades.js');

let whitelist = new Map();

function genWhitelist() {
    for (let item of global.whitelist ?? []) {
        whitelist.set(item, 1);
    }
}

function inPriceRange(min, max, price) {
    return price <= max && price >= min;
}

function checkMarkup(maxMarkup, markup) {
    return markup <= maxMarkup;
}

function enoughBalance(price, balance) {
    return balance >= price;
}

function quickfilterWhitelist(name) {
    if (!global.config.quick_filter_use_whitelist) {
        return true;
    }
    return whitelist.has(name);
}

function checkWhitelist(name) {
    return whitelist.has(name);
}

function checkBlacklist(useBlacklist, name) {
    if (useBlacklist) {
        if (checkWhitelist(name)) {
            return true;
        }

        for (let i = 0; i < global.blacklist.length; i++) {
            let text = global.blacklist[i];
            if (name.indexOf(text) >= 0) {
                //return false if name is found in blacklist
                return false;
            }
        }

        whitelist.set(name, 1);
    } else {
        //always true if blacklist is not used
        return true;
    }
    return true;
}

function checkStatTrak(allowStat, trade) {
    if (allowStat) return true;
    if (trade.itemName.indexOf("StatTrak") >= 0) {
        //if the user does not allow StatTrak skin withdraw and the skin name contains "StatTrak" return false
        return false;
    }
    return true;
}

function checkSouvenir(allowSouvenir, trade) {
    if (allowSouvenir) return true;
    if (trade.itemName.indexOf("Souvenir") >= 0) {
        //if the user does not allow Souvenir skin withdraw and the skin name contains "Souvenir" return false
        return false;
    }
    return true;
}

// TODO only works for skins rn
function wearAcceptable(filter, trade) {
    if ((filter.fn && trade.itemWearName == "Factory New")
        || (filter.mw && trade.itemWearName == "Minimal Wear")
        || (filter.ft && trade.itemWearName == "Field-Tested")
        || (filter.ww && trade.itemWearName == "Well-Worn")
        || (filter.bs && trade.itemWearName == "Battle-Scarred")
        || trade.itemWearName == null) {
        // Passed wear filter

        return true;
    } else {
        return false;
    }
}

function hasStickers(trade) {
    return trade.stickers.length > 0;
}

function stickerMatches(filter, trade) {
    for (let i = 0; i < trade.stickers.length; i++) {
        let sticker = trade.stickers[i];
        let stickerName = (sticker.color != null ? sticker.color + " | " : "") + sticker.name;
        if ((filter.buyScrapedCraft || sticker.wear == 0) && stickerName.indexOf(filter.name) > 0) {
            return true;
        }
    }
    return false;
}

function checkName(filterName, name) {
    return name.indexOf(filterName) >= 0;
}

function checkCustomFloatRange(filters, trade) {
    let wear = trade.itemWear;

    if (wear == null) {
        //no float so it's not a skin and we just let it pass the filter
        return true;
    }
    switch (trade.itemWearName) {
        case null: {
            return true;
        }
        case "Factory New": {
            let min = filters.fnMin;
            let max = filters.fnMax;
            return wear >= min && wear <= max;
        }
        case "Minimal Wear": {
            let min = filters.mwMin;
            let max = filters.mwMax;
            return wear >= min && wear <= max;
        }
        case "Field-Tested": {
            let min = filters.ftMin;
            let max = filters.ftMax;
            return wear >= min && wear <= max;
        }
        case "Well-Worn": {
            let min = filters.wwMin;
            let max = filters.wwMax;
            return wear >= min && wear <= max;
        }
        case "Battle-Scarred": {
            let min = filters.bsMin;
            let max = filters.bsMax;
            return wear >= min && wear <= max;
        }
        default: {
            //No clue how you would ever get here but just in case we return true
            return true;
        }
    }
}

function checkFilters(trade, balance, con) {
    let filters = global.filters;

    if (filters == null) {
        console.log("Filters not specified. Can't check item")
        return;
    }

    for (let filter of filters.general) {
        if (!enoughBalance(trade.totalValue, balance)) continue;
        if (!inPriceRange(filter.min, filter.max, trade.totalValue)) continue;
        if (!checkStatTrak(filter.stat, trade)) continue;
        if (!checkBlacklist(filter.blacklist, trade.itemName)) continue;
        if (!checkMarkup(filter.percent, trade.markupPercent)) continue;
        if (!checkSouvenir(filter.souvenir, trade)) continue;
        if (!wearAcceptable(filter, trade)) continue;
        if (filters.generalsUseCustomFloat && !checkCustomFloatRange(filters, trade)) continue;

        completeTrade(trade, con);
        //console.log("Matched General filter", createLabelFromTradeData(trade));
        return;
    }

    for (let filter of filters.stickers) {
        if (!hasStickers(trade)) continue;
        if (!inPriceRange(filter.min, filter.max, trade.totalValue)) continue;
        if (!checkMarkup(filter.percent, trade.markupPercent)) continue;
        if (!enoughBalance(trade.totalValue, balance)) continue;
        if (!checkBlacklist(filter.blacklist, trade.itemName)) continue;
        if (!checkStatTrak(filter.stat, trade)) continue;
        if (!checkSouvenir(filter.souvenir, trade)) continue;
        if (!wearAcceptable(filter, trade)) continue;
        if (filters.stickerUseCustomFloat && !checkCustomFloatRange(filters, trade)) continue;
        if (!stickerMatches(filter, trade)) continue;

        completeTrade(trade, con);

        let stickerName = "";

        for (let i = 0; i < trade.stickers.length; i++) {
            let sticker = trade.stickers[i];
            let stickerName = (sticker.color != null ? sticker.color + " | " : "") + sticker.name;
            if ((filter.buyScrapedCraft || sticker.wear == 0) && stickerName.indexOf(filter.name) > 0) {
                break;
            }
        }

        console.log("Matched Sticker filter " + stickerName, createLabelFromTradeData(trade));
        return;
    }

    for (let filter of filters.specific) {
        if (!checkName(filter.name, trade.itemName)) continue;
        if (!inPriceRange(filter.min, filter.max, trade.totalValue)) continue;
        if (!checkMarkup(filter.percent, trade.markupPercent)) continue;
        if (!enoughBalance(trade.totalValue, balance)) continue;
        if (!checkBlacklist(filter.blacklist, trade.itemName)) continue;
        if (!checkStatTrak(filter.stat, trade)) continue;
        if (!checkSouvenir(filter.souvenir, trade)) continue;
        if (!wearAcceptable(filter, trade)) continue;
        if (filters.specificUseCustomFloat && !checkCustomFloatRange(filters, trade)) continue;

        completeTrade(trade, con);
        console.log("Matched Specific item", createLabelFromTradeData(trade));
        return;
    }
}

let lengthLastSync = 0;

function syncWhitelist() {
    let whitelistKeys = Array.from(whitelist.keys());

    if (lengthLastSync == whitelistKeys.length && lengthLastSync != 0) {
        return;
    }

    lengthLastSync = whitelistKeys.length;

    console.log(`Updating whitelist with`, whitelistKeys.length, `keys`);

    axios({
        method: 'post',
        url: 'http://localhost:3020/update-whitelist',
        headers: { "Content-Type": 'application/json' },
        data: whitelistKeys
    }).catch(err => console.warn(err));
}

async function completeTrade(trade, con, fullTrade) {
    let join = await createTrade(trade.tradeId);

    con.sendUTF(JSON.stringify(join));

    console.log("Trying to withdraw", createLabelFromTradeData(trade, fullTrade));
}

module.exports = {
    checkFilters,
    completeTrade,
    syncWhitelist,
    genWhitelist,
    quickfilterWhitelist
};