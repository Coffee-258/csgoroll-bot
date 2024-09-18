const axios = require('axios');
const { createSubscription, decodeGraphqlUrl } = require('./subscriptions.js');
const { OPERATIONS, QUERYS } = require('./enums.js');
const { getSession } = require('./session.js');

let assetIdMap = {};

let listings = {};
let soldItems = [];

const ONE_HOUR = 60 * 60 * 1000;

async function getInventory(cursor) {
    let variables = {
        steamAppName: "CSGO",
        first: global.config.inventory_load_size,
        userId: global.license.roll_user_id,
    };

    if(cursor != null) {
        variables.after = cursor;
    }

    let extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: "01ea308cc60ffbd5a4671fe8e762c45ebced3f51c88b89ac245a9f590000c140"
        }
    };

    return new Promise((resolve) => {
        axios({
            method: 'get',
            url: decodeGraphqlUrl('steamInventoryItems', variables, extensions),
            headers: { 
                "Cookie": `session=${getSession()};`,
                'user-agent': global.config.user_agent,
             },
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            console.warn(err.message);
            resolve();
        });
    });
}

let inventoryCache;

const FIVE_MINUTES = 1000 * 60 * 5;

async function getFullInventory() {
    let items = [];

    let completed = false;
    let cursor;

    if(inventoryCache != null && (new Date() - inventoryCache.date) < FIVE_MINUTES) {
        console.log("Loaded csgoroll steam inventory from cache. Please wait ", (300 - Math.abs((new Date() - inventoryCache.date) / 1000)), "seconds");
        return inventoryCache.data;
    }

    while(!completed){
        let inventoryChunk = await getInventory(cursor);
        let pageInfo = inventoryChunk?.data?.steamInventoryItems?.pageInfo;

        if(pageInfo == null || pageInfo.hasNextPage == false ) {
            completed = true;
        }

        if(pageInfo != null) {
            cursor = pageInfo.endCursor;
        }

        let _items = inventoryChunk?.data?.steamInventoryItems?.edges;

        if(_items != null) {
            for(let node of _items) {
                let item = node.node;
                items.push(item);
            }
        }

        await new Promise(r => setTimeout(r, 500));
    }

    console.log("Steam inventory loaded from csgoroll. Containing", items.length, "items");

    inventoryCache = {
        date: new Date(),
        data: items
    }

    return items;
}

async function getListedItems() {
    let variables = {
        first: global.config.listing_load_size,
        orderBy: "UPDATED_AT_DESC",
        statuses: ["LISTED"],
        userId: global.license.roll_user_id
    }

    let extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: "370cc2ab313478101f83a24c105b2de2ad6b645ce45013acdd1da52646f89ecc"
        }
    };

    return new Promise((resolve) => {
        axios({
            method: 'get',
            url: decodeGraphqlUrl('TradeList', variables, extensions),
            headers: {
                "Cookie": `session=${getSession()};`,
                'user-agent': global.config.user_agent,
            },
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            console.warn(err.message);
            resolve();
        });
    });
}

async function getListedItemSteamExternalAssetIds() {
    let listedData = await getListedItems();

    if (listedData == null || listedData.data == null || listedData.data.trades == null) {
        console.log("Couldn't load trade data skipping.");
        return null;
    }

    let trades = listedData.data.trades.edges;
    let itemsInTrades = [];

    for (let item of trades) {
        let i = item.node;
        itemsInTrades.push(i.tradeItems[0].steamExternalAssetId);

        listings[i.tradeItems[0].steamExternalAssetId] = {
            value: i.totalValue,
            markup: i.markupPercent,
            time: new Date(i.updatedAt),
            tradeId: i.id
        };
    }

    return itemsInTrades;
}

function removeListingEntry(steamExternalAssetId) {
    listings[steamExternalAssetId] = null;

    soldItems.push(steamExternalAssetId);
}

async function getDepositableItems() {
    let inventoryData = await getInventory();

    let depositable = [];

    if (inventoryData == null || inventoryData.data == null || inventoryData.data.steamInventoryItems == null) {
        console.log("Loaded empty steam inventory, this might be caused by an error in roll API");
        return [];
    }

    for (let item of inventoryData.data.steamInventoryItems.edges) {
        let i = item.node;

        assetIdMap[i.steamExternalAssetId] = i.steamItemIdentifiers.assetId;

        if (i.itemVariant.value >= 1 && i.tradable) {
            depositable.push(i);
        }
    }

    return depositable;
}

function round3DecimalsDown(number) {
    return parseFloat((Math.floor(number * 1000) / 1000).toFixed(3));
}

async function getFloat(sadString) {
    //I'm sorry but nobody will notice, right :)
    let apiUrl = "https://api.csgotrader.app/float";
    let steamBaseUrl = "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20"

    let url = steamBaseUrl + sadString;

    return new Promise((resolve) => {
        axios.get(apiUrl + "?url=" + encodeURIComponent(url)).then((response) => {
            if(response.data.iteminfo?.floatvalue != null) {
                resolve(response.data.iteminfo.floatvalue);
            } else {
                resolve();
            }
        }).catch(err => {
            console.warn(err.message);
            resolve();
        });
    });
}

function listItems(con, unlistedItems) {
    let variables = {
        input: {
            promoCode: null,
            tradeItemsList: unlistedItems
        },
        trackByUniqueId: true,
        recaptcha: null,
        visualRecaptcha: null
    }

    let listingSubscription = createSubscription(OPERATIONS.createTrades, QUERYS.createTrades, variables);
    con.sendUTF(JSON.stringify(listingSubscription));
}

function dummyListItems(con) {
    listItems(con, []);
}

async function cancelOutdatedTrades(con) {
    let l = Object.keys(listings);

    let tradeIdsToUnlist = [];

    for (_l of l) {
        let listing = listings[_l];

        if (listing == null) continue;

        if (((new Date) - listing.time) > (ONE_HOUR * global.config.markup_reduction_interval_hrs) && listing.markup != global.config.deposit_min_markup || listing.markup < global.config.deposit_min_markup) {
            if (!global.blockedTrades.includes(listing.tradeId)) {
                tradeIdsToUnlist.push(listing.tradeId);
            }
        }
    }

    let variables = {};

    let i = 0;

    for (let id of tradeIdsToUnlist) {
        variables["input" + i] = {
            tradeId: id
        };
        i++;
    }

    if (tradeIdsToUnlist.length == 0) {
        return;
    }

    console.log("Trying to cancel " + tradeIdsToUnlist.length + " listings");

    let query = createTradeCancelQuery(tradeIdsToUnlist.length);

    let cancelTradesSubscription = createSubscription(OPERATIONS.cancelTrades, query, variables);

    con.sendUTF(JSON.stringify(cancelTradesSubscription));
}

async function listUnlistedItems(con) {

    let itemsInTrades = await getListedItemSteamExternalAssetIds();

    if (itemsInTrades == null) {
        return null;
    }

    console.log(`Found`, itemsInTrades.length, `active trades`);

    let depositable = await getDepositableItems();
    console.log(`Found`, depositable.length, `depositable items`);

    let unlistedItems = [];

    for (let item of depositable) {
        let steamExternalAssetId = item.steamExternalAssetId;

        let listing = listings[steamExternalAssetId];

        if (!itemsInTrades.includes(steamExternalAssetId) && !soldItems.includes(steamExternalAssetId)) {
            global.logWithoutDiscord(`Found unlisted item ${item.itemVariant.externalId}`);

            let assetId = item.steamItemIdentifiers.assetId;
            let itemVariantId = item.itemVariant.id;
            let value = item.itemVariant.value;

            let markup = global.config.standard_markup;

            if (item.maxMarkupPercent > global.config.manual_markup_treshold) {
                global.logWithoutDiscord(`Max markup for ${item.itemVariant.externalId} > ${global.config.manual_markup_treshold}%. Manual pricing required`);
                continue;
            }

            if (listing == null || listing.markup < global.config.deposit_min_markup) {
                markup = global.config.standard_markup;

                if (item.maxMarkupPercent > 12) {
                    if(global.config.sticker_price_factor >= 1) {
                        markup = item.maxMarkupPercent;
                    } else {
                        let m = item.maxMarkupPercent - 12;
                        m = m * global.config.sticker_price_factor;
                        markup += m;
                    }
                }

            } else {

                if (((new Date) - listing.time) > (ONE_HOUR * global.config.markup_reduction_interval_hrs)) {
                    markup = listing.markup - global.config.reduce_markup_step;

                    //+0.01 to avoid rounding problems in roll backend
                    markup = Math.max(markup, global.config.deposit_min_markup + 0.01);
                    global.logWithoutDiscord(`Repricing ${item.itemVariant.externalId} ${round3DecimalsDown(listing.markup)}% => ${round3DecimalsDown(markup)}%`);
                } else {
                    markup = listing.markup;
                }
            }

            if (markup > item.maxMarkupPercent) {
                markup = item.maxMarkupPercent;
            }

            if (markup < global.config.deposit_min_markup) {
                markup = global.config.deposit_min_markup;
            }

            global.logWithoutDiscord(`Listing for ${round3DecimalsDown(value * (1 + (markup / 100)))} +${round3DecimalsDown(markup)}%`);

            let depositObject = {
                assetId: assetId,
                itemVariantId: itemVariantId,
                value: round3DecimalsDown(value * (1 + (markup / 100)))
            }

            unlistedItems.push(depositObject);
        }
    }

    if (unlistedItems.length > 0) {
        console.log(`Sending list message for ${unlistedItems.length} items`);
        listItems(con, unlistedItems);
    } else {
        console.log("No unlisted items found calling dummy listing call");
        dummyListItems(con);
    }
}

function getSteamIdForExternalId(externalId) {
    return assetIdMap[externalId];
}

function createTradeCancelQuery(length) {
    let inputs = [];
    let trades = [];

    for (let i = 0; i < length; i++) {
        inputs.push(`$input${i}: CancelTradeInput!`)

        trades.push(
            `trade${i}: cancelTrade(input: $input${i}) {
                trade {
                    ...TradeCancel
                    __typename
                }
                __typename
            } `
        );
    }

    return `mutation CancelTrades(${inputs.join(", ")})
    {
        ${trades.join("\n")}
    }
    fragment TradeCancel on Trade {
        id
        cancelReason
        expiresAt
        status
        totalValue
        __typename
    }`;
}

module.exports = {
    listUnlistedItems,
    getSteamIdForExternalId,
    dummyListItems,
    cancelOutdatedTrades,
    removeListingEntry,
    getFullInventory,
    getFloat
}
