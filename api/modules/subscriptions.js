const { uuidv4 } = require('./helpers.js');
const { OPERATIONS, QUERYS } = require('./enums.js');

function createSubscription(operationName, query, variables) {
    let subscription = {};

    subscription.id = uuidv4();
    subscription.type = "subscribe";
    subscription.payload = {};
    subscription.payload.variables = variables ?? {};
    subscription.payload.extensions = {};
    subscription.payload.operationName = operationName;
    subscription.payload.query = query;

    return subscription;
}

function subscribeWalletUpdates(con) {
    let walletSubscription = createSubscription(OPERATIONS.updateWallet, QUERYS.updateWallet);
    walletSubscriptionId = walletSubscription.id;

    con.sendUTF(JSON.stringify(walletSubscription));

    return walletSubscriptionId;
}

function decodeGraphqlUrl(operationName, variables, extensions) {
    return 'https://api.csgoroll.gg/graphql?operationName=' + operationName + '&variables=' + encodeURIComponent(JSON.stringify(variables))
        + '&extensions=' + encodeURIComponent(JSON.stringify(extensions));
}

function subscribeUpdateTrades(con) {
    let variables = {
        userId: global.license.roll_user_id
    }

    let updateTradesSubscription = createSubscription(OPERATIONS.updateTrade, QUERYS.updateTrade, variables);
    updateTradesSubscriptionId = updateTradesSubscription.id;

    con.sendUTF(JSON.stringify(updateTradesSubscription));

    return updateTradesSubscriptionId;
}

function subscribeNewTrades(con) {
    let tradesSubscription = createSubscription(OPERATIONS.createTrade, QUERYS.createTrade);
    tradesSubscriptionId = tradesSubscription.id;

    con.sendUTF(JSON.stringify(tradesSubscription));

    return tradesSubscriptionId;
}

function dummyStash(con) {
    let variables = {
        input: {
            amount: 0.0001,
            lockDuration: "NONE"
        }
    }

    let stashOperation = createSubscription(OPERATIONS.stashUnstash, QUERYS.stashUnstash, variables);

    con.sendUTF(JSON.stringify(stashOperation));
}

function unsubscribe(con, id) {
    let message = {
        id: id,
        type: "complete"
    }

    con.sendUTF(JSON.stringify(message));
}

module.exports = {
    createSubscription,
    subscribeWalletUpdates,
    subscribeUpdateTrades,
    subscribeNewTrades,
    dummyStash,
    unsubscribe,
    decodeGraphqlUrl
};