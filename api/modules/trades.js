const axios = require('axios');

const { createSubscription } = require('./subscriptions.js');
const { cleanupMarketname, uuidv4 } = require('./helpers.js');
const { OPERATIONS, QUERYS } = require('./enums.js');
const { sendDiscordMessage } = require('./discord.js');
const { getSteamIdForExternalId, removeListingEntry } = require('./inventory.js');
const { getCaptcha, getVCaptcha } = require('./captcha_new.js');

let activeDeposits = [];

let token = "";
let visualToken = "";

function initSteamTrade(data, label) {
    if (data.depositor == null) return;
    if (data.depositor.steamId != global.secrets.steam_id) return;

    for (let i = 0; i < activeDeposits.length; i++) {
        const deposit = activeDeposits[i];

        if (deposit == data.id) {
            // Remove from active deposits
            let index = activeDeposits.indexOf(deposit);
            if (index !== -1) {
                activeDeposits.splice(index, 1);
            }

            sendDiscordMessage("Posting steam trade to API. Item: " + label);

            postSteamTrade(data);
        }
    }
}

function postSteamTrade(data) {
    let tradeUrl = data.withdrawerSteamTradeUrl;
    let assetId = getSteamIdForExternalId(data.tradeItems[0].steamExternalAssetId);
    let marketName = cleanupMarketname(data.tradeItems[0].marketName);
    let tradeId = data.id;

    console.log("Trying to create steam trade", marketName);

    global.blockedTrades.push(tradeId);

    //removeListingEntry(data.tradeItems[0].steamExternalAssetId);

    axios({
        method: 'post',
        url: 'http://localhost:3000/createTrade',
        headers: { "Content-Type": "application/json" },
        data: {
            tradeUrl: tradeUrl,
            assetId: assetId,
            tradeId: tradeId
        }
    }).then(response => {
        console.log("Posted trade to steam api", response.status);
    }).catch(err => console.warn(err));
}

function confirmDeposit(con, data, trade) {
    let variables = {
        input: {
            tradeId: data.id
        }
    }

    let confirmation = createSubscription(OPERATIONS.processTrade, QUERYS.processTrade, variables);
    con.sendUTF(JSON.stringify(confirmation));

    activeDeposits.push(trade.tradeId);
}

let loadCaptcha = false;

async function triggerCaptcha() {
    loadCaptcha = true;
}

let loading = false;

async function getTokens() {
    if (loading) return;

    loading = true;
    console.log("Getting new captcha tokens");
    token = await getCaptcha();
    visualToken = await getVCaptcha();

    loadCaptcha = false;
    loading = false;
}

async function createTrade(withdrawId) {
    if (loadCaptcha) {
        getTokens();
    }

    let variables = {
        input: {
            tradeIds: [withdrawId],
            hasCompliedToAntiRWT: true,
            recaptcha: token,
            visualRecaptcha: visualToken
        }
    }

    let trade = createSubscription(OPERATIONS.joinTrade, QUERYS.joinTrade, variables);

    return trade;
}

/*
async function getCaptcha() {  
    return new Promise((resolve, reject) => {
        axios({
            method: 'get',
            url: 'http://localhost:3010/captcha',
        }).then(response => {
            resolve();
        }).catch(err => {
            console.warn(err);
            resolve();
        });
    });
}

function onlyGetCaptcha() {
    axios({
        method: 'get',
        url: 'http://localhost:3010/only-captcha',
    }).then(response => {
        token = response.data.token;
        console.log("Captcha token updated", token.substring(35, 50));
    }).catch(err => console.warn(err));
}*/

function cancelRollTrade(tradeId, con) {
    let variables = {
        input: {
            tradeId: tradeId
        }
    }

    global.blockedTrades = global.blockedTrades.filter(e => e !== tradeId);

    let cancel = createSubscription(OPERATIONS.cancelTrade, QUERYS.cancelTrade, variables);
    con.sendUTF(JSON.stringify(cancel));
}

function cancelRollTrades(con) {
    axios({
        method: 'get',
        url: 'http://localhost:3000/tradesToCancel',
    }).then(response => {
        let tradeIds = response.data.trades;

        if (tradeIds.length > 0) {
            for (let id of tradeIds) {
                console.log("Canceling roll trade for tradeId:" + id);
                cancelRollTrade(id, con);
            }
        }
    }).catch(err => console.warn(err));
}

let noMarkupId = uuidv4();

async function completeFastTrade(con, tradeId) {

    if (loadCaptcha) {
        await getTokens();
    }

    con.sendUTF(`{
        "id": "${noMarkupId}",
        "type": "subscribe",
        "payload": {
          "variables": {
            "input": {
              "tradeIds": [
                "${tradeId}"
              ],
              "hasCompliedToAntiRWT": true,
              "recaptcha": "${token}",
              "visualRecaptcha": "${visualToken}"
            }
          },
          "extensions": {},
          "operationName": "JoinTrades",
          "query": "mutation JoinTrades($input: JoinTradesInput!) { joinTrades(input: $input) { trades {      id      status      totalValue      updatedAt      expiresAt      withdrawer {        id        steamId        avatar        displayName        steamDisplayName        __typename      }      __typename    }    __typename  }}"
        }
      }`);

    //console.log(con.bufferedAmount);

    //while (con.bufferedAmount >= 0) { }

    noMarkupId = uuidv4();
}

module.exports = {
    confirmDeposit,
    initSteamTrade,
    createTrade,
    triggerCaptcha,
    cancelRollTrades,
    completeFastTrade
};