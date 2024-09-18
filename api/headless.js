const { TradeData } = require('./modules/classes.js');

const { startCluster, stopCluster } = require('./withdraw_cluster.js');
const { createLabelFromTradeData } = require('./modules/helpers.js');
const { subscribeWalletUpdates, subscribeUpdateTrades, subscribeNewTrades, dummyStash, unsubscribe } = require('./modules/subscriptions.js');
const { confirmDeposit, initSteamTrade, triggerCaptcha, cancelRollTrades, completeFastTrade } = require('./modules/trades.js');
const { checkFilters, syncWhitelist, quickfilterWhitelist } = require('./modules/filter.js');
const { listUnlistedItems, dummyListItems, cancelOutdatedTrades } = require('./modules/inventory.js');
const { getSession, renewSession, updateCsgorollLoyaltyToken } = require('./modules/session.js');
const { getUserData } = require('./modules/user');
const { checkLicenseValidity } = require('./modules/license.js');
const { sendDiscordTradeMessage } = require('./modules/discord.js');
const { openBoxes } = require("./modules/daily_collector.js");
const { refactorName } = require("./buff_check.js");

const { addBalanceLog, createTradeRecord } = require('./modules/logging.js');

const ws = require("ws");

const wss = new ws.WebSocketServer({
  port: 3012,
});

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    client.send(data);
  });
};

//please no questions
function sendInventoryUpdate(newEntry) {
  let msg = { type: "inventory-update" };
  msg.data = newEntry;

  wss.broadcast(JSON.stringify(msg));
}

function startHeadlessScript() {
  let WebSocketClient = require('websocket').client;
  let client = new WebSocketClient();

  let con;

  let tradesSubscriptionId = "";
  let walletSubscriptionId = "";
  let updateTradesSubscriptionId = "";

  let balance = 0;
  global.balance = 0;
  let user = null;

  let depositActive = global.config.deposit_active ?? false;
  let withdrawActive = global.config.withdraw_active ?? false;

  let lastConnected;

  wss.on("connection", (ws) => {

    ws.on("error", console.error);

    ws.on("message", async (data) => {
      let d = JSON.parse(data);

      if (d.type == "update-filters") {
        global.filters = d.filters;
        console.log("Updated filters");
      }

      if (d.type == "toggle-withdraw") {
        withdrawActive = !withdrawActive;
        console.log("Changed withdraw status to", withdrawActive);

        if (global.config.use_cluster && withdrawActive) {
          startCluster(user);
        }

        if (global.config.use_cluster && !withdrawActive) {
          stopCluster();
        }

        sendWithdrawUpdateMessage();
      }

      if (d.type == "toggle-deposit") {
        depositActive = !depositActive;
        console.log("Changed deposit status to", depositActive);

        sendDepositUpdateMessage();
      }

      if (d.type == "send-roll-socket") {
        //This is for testing purposes only

        dummyListItems(con);
      }
    });


    sendBalanceMessage();
    sendDepositUpdateMessage();
  });

  function sendWithdrawUpdateMessage() {
    let msg = { type: "updated-withdraw" };
    msg.data = {
      status: withdrawActive
    }

    wss.broadcast(JSON.stringify(msg));
  }

  function sendDepositUpdateMessage() {
    let msg = { type: "updated-deposit" };
    msg.data = {
      status: depositActive
    }

    wss.broadcast(JSON.stringify(msg));
  }

  function sendBalanceMessage(balance) {
    let msg = { type: "balance-update" };
    msg.data = {
      date: new Date(),
      balance: balance
    }

    wss.broadcast(JSON.stringify(msg));
  }

  function sendTradeMessage(data) {
    let msg = { type: "trade-update" };
    msg.data = data;

    wss.broadcast(JSON.stringify(msg));
  }

  function sendTradeStatusMessage(data) {
    let msg = { type: "trade-status" };
    msg.data = data;

    wss.broadcast(JSON.stringify(msg));
  }

  client.on('connectFailed', function (error) {
    console.log('Connect Error: ' + error.toString());

    
    setTimeout(() => {
      reconnectClient();
    }, 1000 * 60);
  });

  client.on('connect', function (connection) {

    con = connection;
    lastConnected = new Date();

    connection.on('error', function (error) {
      console.log("Connection Error: " + error.toString());

      console.log("Trying to reconnect in 5 minutes");
    });

    connection.on('close', function (e) {
      console.log('closed', e);

      reconnectClient();
    });

    connection.on('message', function (message) {
      handleMessage(message);
    });

    con.sendUTF('{"type":"connection_init"}');
  });

  function reconnectClient() {
    if (((new Date) - new Date(lastConnected)) < 1000 * 60) {
      console.log(`Last connected ${lastConnected} waiting 1 minute before reconnecting`);
      setTimeout(function () {
        connectClient();
      }, 60 * 1000);
    } else {
      setTimeout(() => {
        console.log(`Last reconnect more than 1 minute ago. Reconnecting immediatly`);
        connectClient();
      }, 1000);
    }
  }

  function connectClient() {
    client.connect(global.license.main_socket_url,
      'graphql-transport-ws',
      null,
      headers = {
        'Cookie': `session=${getSession()};`,
        'user-agent': global.config.user_agent,
      }
    );
  }

  connectClient();

  function handleMessage(message) {

    //console.log(message);

    message = JSON.parse(message.utf8Data);

    if (message.type == "connection_ack") {
      console.log("Connection acknowledged");

      //subscribe to all relevant events
      tradesSubscriptionId = subscribeNewTrades(con);
      walletSubscriptionId = subscribeWalletUpdates(con);
      updateTradesSubscriptionId = subscribeUpdateTrades(con, secrets);

      //stash 0.0001 coins to trigger OnWalletUpdate if no balance was previously loaded
      //this doubles as initial load trigger because why not + lazy
      if (balance == 0) {

        getUserData().then((data) => {
          if (data?.data != null && data.data.currentUser != null) {

            user = data.data.currentUser;
            global.rollUser = user;
            balance = user.wallets[0].amount;
            global.balance = balance;

            if (withdrawActive && global.config.use_cluster) {
              startCluster(user);
            }

            console.log("Got user data and balance", balance);
            console.log("User-ID: " + user.id);

            if (user.id != global.license.roll_user_id) {
              console.log("Session User-ID does not match License User-ID");
              process.exit(1);
            }
          } else {
            console.log("Error getting userdata from csgoroll");
            dummyStash(con);
          }

          initListingLoop();
        });

        initPingLoop();
      }
    }

    if (message.type == "pong") {
      //console.log("Ping response received");
    }

    if (message.type == "next") {
      //New Trade
      if (message.id == tradesSubscriptionId) {
        if (withdrawActive) {
          handleNewDeposit(message);
        }
      }

      //New Wallet Update
      if (message.id == walletSubscriptionId) {
        let wallet = message.payload.data.updateWallet.wallet;
        if (wallet.name == "MAIN") {
          let oldBalance = balance;
          balance = wallet.amount;
          global.balance = balance;

          //Only trigger these for relevant balance changes. Others are most likely caused by daily unboxing
          if (Math.abs(balance - oldBalance) > 1) {
            addBalanceLog(balance);
            sendBalanceMessage(balance);

            console.log("New balance:", balance);
          }
        }
      }

      //Update to trade
      if (message.id == updateTradesSubscriptionId) {
        let data = message.payload.data.updateTrade.trade;

        handleTradeUpdate(data);
      }
    }

    if (message.payload != null && message.payload.errors) {
      message.payload.errors.forEach(async error => {
        console.log(error.message);

        if (error.message.includes("cannot be cancelled in its current state") || error.message.includes("currently included in active trades")) {
          return;
        }

        // Check for captcha error
        if (error.message.includes("incognito")) {
          if (global.config.refresh_captcha) {
            triggerCaptcha();
          }
        }

        if (error.message.includes("unauthenticated")) {
          console.log("Csgoroll session expired");

          if (global.config.auto_refresh_roll_session == false) {
            console.log("update session and restart the bot");
            process.exit(1);
          }

          await renewSession();
          await new Promise(r => setTimeout(r, 5000));
          connectClient();
        }

        //unsubscribe if trade is not joinable 
        if (error.message.includes("This withdrawal is no longer available") || error.message.includes("This trade is not joinable")) {
          unsubscribe(con, message.id);
        }

        if (error.message.includes("exceeds your daily withdrawal limit")) {
          console.log("Withdraw limit reached");
          withdrawActive = false;
        }
      });
    }
  }

  function handleNewDeposit(message) {
    let data = message.payload.data.createTrade.trade;

    if (data.tradeItems == null) {
      //Roll api is ass and sometimes data just isnt present when it should be :)

      //console.log("tradeItems null");
      //console.log(JSON.stringify(data));
      return;
    }

    let item = data.tradeItems[0];

    if (item == null || item == undefined || item.itemVariant == null) {
      //Another case of roll api doing things idk just return here so we don't cause any errors in the rest of the code

      //console.log("Item undefined");
      //console.log(JSON.stringify(data));
      return;
    }

    if (item.markupPercent <= global.config.quick_filter_max_markup
      && item.value >= global.config.quick_filter_min_value
      && item.value <= global.config.quick_filter_max_value
      && item.value <= balance
      && quickfilterWhitelist(item.itemVariant.externalId)) {
      //not wasting any time here

      completeFastTrade(con, data.id);

      console.log(`Trying to withdraw at ${item.markupPercent}%`);
      return;
    }

    let trade = new TradeData(data.id, item.itemVariant.externalId, item.value, item.markupPercent, data.avgPaintWear, item.itemVariant.color, item.stickers, data);

    //console.log(`New deposit ${trade.itemName} ${trade.markupPercent}%`);

    if (data.depositor != null) {
      // Not null depositor means own trade
      return
    }

    checkFilters(trade, balance, con);
  }

  function handleTradeUpdate(data) {

    let item = data.tradeItems[0];

    if (item == null || item == undefined || item.itemVariant == null) {
      //Another case of roll api doing things idk just return here so we don't cause any errors in the rest of the code

      //console.log("Item undefined");
      //console.log(JSON.stringify(data));
      return;
    }

    let trade = new TradeData(data.id, item.itemVariant.externalId, item.value, item.markupPercent, data.avgPaintWear, item.stickers, data);

    let label = createLabelFromTradeData(trade);

    if (data.status == "LISTED") {
      console.log(data.status, "CHANGED", label);
    }

    //You joined a trade
    if (data.status == "JOINED" && data.depositor.steamId != global.secrets.steam_id) {
      console.log("You joined:", label);

      let refactoredName = refactorName(item.itemVariant.externalId);
      global.joinedTrades[refactoredName] = trade;
    }

    //Someone joined your trade
    if (data.status == "JOINED" && data.depositor.steamId == global.secrets.steam_id) {
      console.log("Someone joined:", label);

      checkLicenseValidity();

      //Handle own trade joined

      if (depositActive) {
        if (trade.markupPercent < global.config.deposit_min_markup) {
          console.log(`Markup under ${global.config.deposit_min_markup}% not accepting trade`);
          return;
        }

        if(trade.markupPercent < 12.1
          && item.stickers != null && item.stickers.length > 0
          && !(trade.itemName.indexOf("Souvenir") == 0)) {
          let value = trade.totalValue;
          let stickerPrice = 0;

          for(let sticker of item.stickers) {
            stickerPrice += sticker?.value;
          }

          console.log(`${trade.itemName}. SP: ${stickerPrice} Value: ${value}`);

          if(stickerPrice / value > 0.2) {
            console.log(`No Stickerprice seems to be applied for ${trade.itemName}. Not accepting trade. SP: ${stickerPrice} Value: ${value}`);
            return;
          }
        }

        confirmDeposit(con, data, trade);
      }
    }

    //Send Steam offer
    if (data.status == "PROCESSING") {
      console.log("Processing:", label);

      if (depositActive) {
        initSteamTrade(data, label);
      }
    }

    if (data.status == "COMPLETED") {
      console.log("Trade was completed", label);

      checkLicenseValidity();

      createTradeRecord(data);
      sendDiscordTradeMessage(data);
      sendTradeMessage(data);
    }

    sendTradeStatusMessage(data);
  }

  async function openDailies() {
    if (!global.config.open_dailies) {
      return;
    }

    let startingBalance = balance;
    let opened = await openBoxes(con);
    let closingBalance = balance;

    if (global.config.sell_csgoroll_inventory && opened) {
      //console.log(`Profit from Dailies: ${closingBalance - startingBalance} Coins`);
    }
  }

  function initPingLoop() {
    setInterval(() => {
      con.sendUTF('{"type":"ping"}');
      syncWhitelist();

      if (depositActive) {
        cancelRollTrades(con);
      }
    }, 60 * 1000);
  }

  let listingIndex = 0;
  function initListingLoop() {
    setInterval(() => {
      if (listingIndex == 15) {
        listingIndex = 0;
        checkLicenseValidity();

        if (depositActive) {
          listUnlistedItems(con);
        }

        openDailies();
      } else if (listingIndex == 14) {

        if (depositActive) {
          cancelOutdatedTrades(con);
        }

      } else if (listingIndex == 7) {
        if (depositActive) {
          listUnlistedItems(con);
        }

        openDailies();
      } else {
        if (depositActive) {
          dummyListItems(con);
        }
      }

      if (global.newSteamLoginSecure != null) {

        let token = global.newSteamLoginSecure;
        global.newSteamLoginSecure = null;

        updateCsgorollLoyaltyToken(con, token);
      }

      listingIndex++;
    }, 60 * 1000);

    if (depositActive) {
      listUnlistedItems(con);
    }

    openDailies();
  }
}

module.exports = {
  startHeadlessScript,
  sendInvetoryUpdate: sendInventoryUpdate
}