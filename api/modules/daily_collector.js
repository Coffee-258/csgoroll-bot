const axios = require('axios');
const { decodeGraphqlUrl } = require('./subscriptions.js');
const { OPERATIONS, QUERYS } = require('./enums.js');
const { createSubscription } = require('./subscriptions.js');
const { getSession } = require('./session.js');

async function getUnopenedIds() {
    let data = await getBoxes();

    let boxes = data?.data?.boxes?.edges;

    let unopenedBoxes = [];

    if(boxes != null) {
        for(let _b of boxes) {
            let box = _b?.node;
            
            if(box != null) {
                let lastOpened = box.userLastPurchasedAt;

                if(lastOpened == null) {
                    continue;
                }

                let hours = Math.abs(new Date() - new Date(lastOpened)) / 36e5;

                if(hours > 24) {
                    //console.log(`${name} can be opened`);
                    let slots = [];

                    for(let slot of box.slots) {
                        slots.push({
                            balance: slot.balance,
                            item: {
                              id: slot.item.id,
                              value: slot.item.value
                            }
                        });
                    }

                    unopenedBoxes.push({
                        id: box.id,
                        slots: slots,
                        name: box.name
                    });
                }
            }
        }
    }

    return unopenedBoxes;
}

async function getBoxes() {
    let variables = {
        includeUserLastPurchasedAt: true,
        includeCreatorId: false,
        includeSlots: true,
        first: 50,
        free: true,
        purchasable: true,
        minLevelRequired: 2,
        orderBy: "MIN_LEVEL_REQUIRED",
        marketSlug: "world"
    };

    let extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: "97c2c9980d61c30ef6f59de22d5dcc2ff181651c2281c6209f6ad7974721fba1"
        }
    };

    return new Promise((resolve) => {
        axios({
            method: 'get',
            url: decodeGraphqlUrl('BoxGrid', variables, extensions),
            headers: { "Cookie": `session=${getSession()};` },
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            console.warn(err.message);
            resolve();
        });
    });   
}

async function sellAllItemsOnSite(con, ids) {
    let variables = {
        input: {
            userItemIds: ids,
            itemVariantIds: []
        }
    }

    let sellItemOperation = createSubscription(OPERATIONS.createExchange, QUERYS.createExchange, variables);

    console.log(`Selling ${ids.length} items from csgoroll inventory`);
    con.sendUTF(JSON.stringify(sellItemOperation));

    //Sleep to give the socket time for a response :)
    await new Promise(r => setTimeout(r, 2000));
}

async function getOnsiteInventory() {
    let variables = {
        first: 250,
        userId: global.license.roll_user_id,
        status: ["REQUESTED", "AVAILABLE"],
        orderBy: "VALUE_DESC",
        includeMarketId: false
    };

    let extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: "b5f8201a198a6822cabe05721f634eb20f65cccd7bdc0c238a109a904ca38272"
        }
    };

    return new Promise((resolve) => {
        axios({
            method: 'get',
            url: decodeGraphqlUrl('UserItemList', variables, extensions),
            headers: { "Cookie": `session=${getSession()};` },
        }).then(response => {
            resolve(response.data);
        }).catch(err => {
            console.warn(err.message);
            resolve();
        });
    });   
}

async function open(con, unopenedBoxes) {
    for(let box of unopenedBoxes) {
        let variables = {
            input: {
                amount: 1,
                boxId: box.id,
                providedBoxMultiplierSlots: box.slots
            }
        }
    
        let unboxOperation = createSubscription(OPERATIONS.openBox, QUERYS.openBox, variables);
    
        console.log(`Opening ${box.name}`);
        con.sendUTF(JSON.stringify(unboxOperation));

        await new Promise(r => setTimeout(r, 500));
    }
}

async function openBoxes(con) {
    let unopenedBoxes = await getUnopenedIds();

    if(unopenedBoxes.length == 0) {
        //console.log("No Daily Case available to open");
        return false;
    }

    await open(con, unopenedBoxes);

    if(!global.config.sell_csgoroll_inventory) {
        return true;
    }

    let inventory = await getOnsiteInventory();

    let items = inventory?.data?.userItems?.edges;

    let itemsToSellIds = [];

    if(items != null) {
        for(let _i of items) {
            let item = _i.node;
            itemsToSellIds.push(item.id);
        }
    }

    if(itemsToSellIds.length > 0) {
        await sellAllItemsOnSite(con, itemsToSellIds);
    }

    return true;
}

module.exports = {
    openBoxes
}