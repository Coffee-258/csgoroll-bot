function setCookiesNom(manager, community, cookies) {
    manager.setCookies(cookies, (err) => {
        if (err) {
            console.log(err);
            console.log("steam session error");
            process.exit(1); // Fatal error since we couldn't get our API key
        }

        console.log("Got API key");
    });

    community.setCookies(cookies, (err) => {
        if (err) {
            console.log(err);
            console.log("steam session error");
            process.exit(1); // Fatal error since we couldn't get our API key
        }

        console.log("Community cookies set");
    });
}

function round2Decimals(number) {
    return (Math.round(number * 100) / 100).toFixed(2)
}

function startSteamService() {
    const SteamUser = require("steam-user");
    const SteamCommunity = require("steamcommunity");
    const SteamTotp = require("steam-totp");
    const TradeOfferManager = require("steam-tradeoffer-manager");
    const FS = require("fs");
    const buffCheck = require("./buff_check.js");

    const { sendTradeDialog } = require("./modules/discord_bot.js");

    const { getExpiration } = require("./modules/jwt_expiration.js");
    const { getFloat } = require("./modules/inventory.js");

    /*
    const errorInterceptor = require("../helpers/error-interceptor")
    errorInterceptor("Steam API");
    */

    const pollDataFilePath = "api/data/polldata.json";

    let user;
    if (!config.login_with_token) {
        user = new SteamUser();
        user.setOption("promptSteamGuardCode", false);


        let logOnOptions = {
            accountName: global.secrets.accountName,
            password: global.secrets.password,
            twoFactorCode: getTwoFactorCode(),
            logonID: Math.ceil(Math.random() * 9999999), // Generate random logonID
        };


        user.on("loggedOn", () => {
            console.log("Logged into Steam");
        });

        user.logOn(logOnOptions);
    }

    let idMap = {};

    let tradesToCancel = [];

    const community = new SteamCommunity();
    const manager = new TradeOfferManager({
        steam: user, // Polling every 30 seconds is fine since we get notifications from Steam
        domain: "localhost",
        language: "en", // English item descriptions
        useAccessToken: true,
        //pollInterval: 10000, // Poll steam api every 10 seconds, default is 30 seconds
        //cancelTime: global.config.auto_cancel_delay * 1000, // Cancel outgoing trade offers after global.config.auto_cancel_delay seconds
    });

    if (user != null) {
        user.on("webSession", (sessionID, cookies) => {
            console.log("New Steam session created");

            if (global.config.update_loyalty_token) {
                for (let cookie of cookies) {
                    if (cookie.split("=")[0] == "steamLoginSecure") {
                        let token = cookie.split("=")[1];

                        token = decodeURIComponent(token).split("||")[1];

                        console.log("New steam token created, preparing to update on csgoroll. Token: " + token.substring(0, 10) + "...");

                        global.newSteamLoginSecure = token;
                    }
                }
            }

            setCookiesNom(manager, community, cookies);

        });
    } else {
        let cookies = [`steamLoginSecure=${global.session.steam}`];

        let exp = getExpiration(global.session.steam);

        console.log(exp.hours, "hours", exp.minutes, "minutes left until steam token expires");

        setCookiesNom(manager, community, cookies);
    }

    function getTwoFactorCode() {
        if (global.secrets.steam_auth_code != null && global.secrets.steam_auth_code != "") {
            return global.secrets.steam_auth_code;
        }
        return SteamTotp.generateAuthCode(global.secrets.sharedSecret);
    }

    if (FS.existsSync(pollDataFilePath)) {
        manager.pollData = JSON.parse(FS.readFileSync(pollDataFilePath).toString("utf8"));
    }

    manager.on("pollData", function (pollData) {
        FS.writeFileSync(pollDataFilePath, JSON.stringify(pollData));
    });

    manager.on("pollFailure", function (data) {
        console.log("Trade offer Manager Poll failed", data.message);
    });

    community.on("sessionExpired", () => {
        console.log("Steam session expired");
        if (!config.login_with_token) {
            user.webLogOn();
        }
    });

    let lastConnected = new Date();

    let connecting = false;

    function reconnectSteam() {
        if (config.login_with_token) return;
        if (connecting) return;

        if (((new Date) - new Date(lastConnected)) < 1000 * 60 * 15) {
            console.log(`Last connected ${lastConnected} waiting 15 minutes before reconnecting`);
            connecting = true;
            setTimeout(function () {
                connecting = false;
                user.webLogOn()
            }, 5 * 60 * 1000);
        } else {
            console.log(`Last reconnect more than 15 minutes ago. Reconnecting immediatly`);
            user.webLogOn()
        }
    }

    manager.on("sentOfferChanged", (offer) => {
        let itemsToGiveString = "";

        if (offer.itemsToGive != null) {
            offer.itemsToGive.forEach((item) => {
                let count = 0;

                if (count > 0) {
                    itemsToGiveString += " - ";
                }

                itemsToGiveString += item.market_name;
                count++;
            });
        }

        if (TradeOfferManager.ETradeOfferState[offer.state].toLowerCase() == "canceled") {
            if (idMap[offer.id] != null) {
                handleRollCancel(idMap[offer.id]);
            }
            console.log("Steam trade cancelled. Item(s):", itemsToGiveString);
        }

        if (TradeOfferManager.ETradeOfferState[offer.state].toLowerCase() == "declined") {
            if (idMap[offer.id] != null) {
                handleRollCancel(idMap[offer.id]);
            }
            console.log("Steam trade declined. Item(s):", itemsToGiveString);
        }

        if (TradeOfferManager.ETradeOfferState[offer.state].toLowerCase() == "accepted") {
            console.log("Steam trade accepted. Item(s):", itemsToGiveString);
        }
    });

    manager.on("newOffer", async (offer) => {
        console.log("New offer " + offer.id + " from " + offer.partner.getSteam3RenderedID());

        if (offer.itemsToGive.length != 0) {
            console.log("Items to give in offer " + offer.id + " not empty");
            return;
        }

        let itemsToReceiveString = "";
        if (offer.itemsToReceive != null) {
            offer.itemsToReceive.forEach((item) => {
                itemsToReceiveString = itemsToReceiveString + "- " + item.market_name
            });
        }

        if (offer.itemsToGive.length == 0) {

            function acceptOffer(callback) {
                offer.accept((err, status) => {
                    if (err) {
                        console.log("Unable to accept offer: " + err.message + " Item(s): " + itemsToReceiveString);

                        if (err.message.includes("Not Logged In")) {
                            reconnectSteam();
                            setTimeout(function () {
                                offer.accept((err, status) => {
                                    if (err) {
                                        console.log("Unable to accept offer: " + err.message + " Item(s): " + itemsToReceiveString);
                                    } else {
                                        
                                        console.log("Offer accepted: " + status + " Item(s): " + itemsToReceiveString);
                                    }
                                });
                            }, 15 * 1000);
                        }
                        //TODO  err.message == Not Logged In
                    } else {
                        if(callback != null) {
                            callback();
                        }
                        console.log("Offer accepted: " + status + " Item(s): " + itemsToReceiveString);
                    }
                });
            }

            function declineOffer(callback) {
                offer.decline((err, status) => {
                    if (err) {
                        console.log("Unable to decline offer: " + err.message + " Item(s): " + itemsToReceiveString);

                        if (err.message.includes("Not Logged In")) {
                            reconnectSteam();
                            setTimeout(function () {
                                offer.decline((err, status) => {
                                    if (err) {
                                        console.log("Unable to decline offer: " + err.message + " Item(s): " + itemsToReceiveString);
                                    } else {
                                        console.log("Offer declined: " + status + " Item(s): " + itemsToReceiveString);
                                    }
                                });
                            }, 15 * 1000);
                        }
                        //TODO  err.message == Not Logged In
                    } else {
                        if(callback != null) {
                            callback();
                        }
                        console.log("Offer declined: " + status + " Item(s): " + itemsToReceiveString);
                    }
                });
            }

            
            if (offer.itemsToReceive.length == 1) {
                if (global.config.use_discord_tradeoffers) {
                    let item = offer.itemsToReceive[0];
                    let name = item.market_name;

        
                    let trade = global.joinedTrades[name];
                    global.joinedTrades[name] = null;

                    let float = null;

                    if(item.actions != null && item.actions[0] != null && item.actions[0].link != null) {
                        let d = item.actions[0].link.split("%assetid%")[1];

                        let sadString = "S" + offer.partner.getSteamID64() + "A" + item.assetid + d;

                        float = await getFloat(sadString);
                        
                        if(float != null) {
                            console.log("Loaded float", float, "for", name);
                        }
                    }

                    if(trade == null) {
                        console.log("Failed to load trade for incoming steam offer");

                        console.log(JSON.stringify(global.joinedTrades));
                        console.log("Technical item name: " + name);
                        return;
                    }
        
                    let priceData = await buffCheck.initBuffCheck(trade);

                    if(priceData == null) {
                        console.log("Failed to load data from buff");
                        return;
                    }

                    sendTradeDialog(
                        {
                            tradeId: trade.id,
                            name: name,
                            float: "" + (float != null ? (""+float).substring(0, 5) : "null"),
                            price: "" + trade.totalValue,
                            markup: "" + trade.markupPercent,
                            buffPercent: "" + (priceData != null ? round2Decimals(priceData.pricePercentage) : "ERROR"),
                            buffUSD: "" + (priceData != null ? round2Decimals(priceData.buffDollarPrice) : "ERROR"),
                            rollUSD: "" + (priceData != null ? round2Decimals(priceData.rollDollarPrice) : "ERROR"),
                            priceAccurate: priceData.accurate,
                            icon: item.getImageURL(),
                            acceptAction: acceptOffer,
                            declineAction: declineOffer
                        }
                    );
                

                } else {
                    if (!global.config.auto_accept) {
                        console.log("Auto accept trade offers set to false, please accept manually");
                        return;
                    }
            
                    acceptOffer();
                }
            }
        }
    });

    function createOffer(tradeUrl, assetId, tradeId) {
        const offer = manager.createOffer(tradeUrl);

        if (global.config.steam_trade_comment != "") {
            offer.setMessage(global.config.steam_trade_comment);
        }

        if (assetId == null || assetId == "") {
            console.log("Couldn't find item for trade");
            return;
        }

        offer.addMyItem({ appid: 730, contextid: 2, assetid: assetId });

        if (offer.itemsToGive.length == 1) {

            function sendOffer(sendOfferAttempts) {
                offer.send(function (err, status) {
                    console.log("Sending trade " + offer.id, "Item:", assetId);

                    if (err) {
                        console.log(`Error sending trade offer ${offer.id}: ${err} (${sendOfferAttempts}/${global.config.send_offer_attempts})`);

                        if (sendOfferAttempts < global.config.send_offer_attempts) {
                            console.log(
                                "There was an error creating the steam trade, retrying again in " + global.config.send_offer_retry_delay + " seconds."
                            );

                            if (err.message.includes("Not Logged In")) {
                                reconnectSteam();
                            }

                            setTimeout(() => {
                                sendOffer(sendOfferAttempts + 1);
                            }, global.config.send_offer_retry_delay * 1000);
                        } else {
                            handleRollCancel(tradeId);
                            console.log(`There was an error creating trade: ${offer.id}. Max retry limit reached.`);
                        }
                    } else {
                        console.log("Trade offer " + offer.id + " sent. Item: " + assetId);

                        let maxAttempts = 5;

                        function cancelTrade(attempt) {
                            attempt++;

                            if (attempt > maxAttempts) {
                                return;
                            }

                            offer.update((err) => {
                                if (err) {
                                    console.log("Unabled to fetch updated offer");
                                    setTimeout(() => {
                                        cancelTrade(attempt);
                                    }, 30000);
                                } else {
                                    //2 = active state 9 = confirmation required
                                    if (!(offer.state == 2 || offer.state == 9)) {
                                        return;
                                    }

                                    offer.cancel((err) => {
                                        if (err) {
                                            console.log("Unabled to cancel steam trade. Trying again in 30 seconds (" + attempt + "/" + maxAttempts + ")", err.message);
                                            setTimeout(() => {
                                                cancelTrade(attempt);
                                            }, 30000);
                                        } else {
                                            console.log("successfully canceled offer");
                                        }
                                    });
                                }
                            });
                        }

                        setTimeout(() => {
                            cancelTrade(0);
                        }, global.config.auto_cancel_delay * 1000);


                        idMap[offer.id] = tradeId;

                        if (status == "pending" && global.config.auto_confirm) {
                            if (global.secrets.identitySecret == null || global.secrets.identitySecret == "") {
                                console.log("Auto confirm active but no identitySecret provided. Skipping mobile confirmation");
                                return;
                            }

                            community.acceptConfirmationForObject(global.secrets.identitySecret, offer.id, function (err) {
                                if (err) {
                                    console.log("Can't confirm trade offer " + offer.id + ": " + err);
                                    return;
                                }

                                console.log("Trade offer " + offer.id + " confirmed. Item: " + assetId);
                            });
                        }
                    }
                });
            }

            sendOffer(0);

            return;
        } else {
            console.log("Error creating trade offer. Items to give: " + offer.itemsToGive.length);
        }
    }

    const express = require("express");
    const bodyParser = require("body-parser");
    const steamApp = express();
    const cors = require('cors');

    steamApp.use(cors({ origin: '*' }));
    steamApp.use(express.json());

    const port = 3000;

    steamApp.use(bodyParser.urlencoded({ extended: true }));

    steamApp.listen(port, () => {
        console.log(`Steam API started`);
    });

    steamApp.get("/ping", (req, res) => {
        res.send("pong");
    });

    steamApp.post("/createTrade", (req, res) => {

        let tradeUrl = req.body.tradeUrl;
        let assetId = req.body.assetId;
        let tradeId = req.body.tradeId;

        if (assetId == null || assetId == "") {
            console.log("Failed to send trade offer, assetId missing. TradeId: " + tradeId);
        }

        console.log("Received trade data for", tradeUrl, "assetId: " + assetId, "rollTradeId: " + tradeId);

        createOffer(tradeUrl, assetId, tradeId);
        res.sendStatus(200).send();
    });

    steamApp.get("/tradesToCancel", (req, res) => {
        res.send(JSON.stringify({ trades: tradesToCancel }));
        tradesToCancel = [];
    });

    function handleRollCancel(tradeId) {
        tradesToCancel.push(tradeId);
    }

}

module.exports = {
    startSteamService
}