let WebSocketClient = require('websocket').client;
const { subscribeWalletUpdates, subscribeNewTrades, dummyStash, unsubscribe } = require('./modules/subscriptions.js');
const { completeFastTrade } = require('./modules/trades.js');
const { quickfilterWhitelist } = require('./modules/filter.js');
const { renewSession } = require('./modules/session.js');

const FS = require("fs");

let sockets = [];

class RollSocket {
  con;
  client;

  tradesSubscriptionId = "";
  walletSubscriptionId = "";

  balance = 0;
  lastConnected;
  session;

  reconnect = true;

  domain;

  withdrawActive = true;

  socketId;

  reconnectClient() {
    if (((new Date) - new Date(this.lastConnected)) < 1000 * 60) {
      this.log(`Last connected ${this.lastConnected} waiting 1 minutes before reconnecting`);
      let deez = this;
      setTimeout(function () {
        deez.connectClient();
      }, 60 * 1000);
    } else {
      this.log(`Last reconnect more than 1 minutes ago. Reconnecting immediatly`);
      this.connectClient();
    }

  }

  //csgoroll.gg
  connectClient() {
    this.client.connect(`wss://api.${this.domain}/graphql`,
      'graphql-transport-ws',
      null,
      {
        'Cookie': `session=${this.session};`,
        'user-agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15",
      }
    );
  }

  initPingLoop() {
    setInterval(() => {
      if (this.con != null) {
        this.con.sendUTF('{"type":"ping"}');
      }
    }, 60 * 1000);
  }

  handleMessage(message) {
    message = JSON.parse(message.utf8Data);

    if (message.type == "connection_ack") {
      this.log("Connection acknowledged");

      //subscribe to all relevant events
      this.tradesSubscriptionId = subscribeNewTrades(this.con);
      this.walletSubscriptionId = subscribeWalletUpdates(this.con);

      //stash 0.0001 coins to trigger OnWalletUpdate if no balance was previously loaded
      //this doubles as initial load trigger because why not + lazy
      if (this.balance == 0) {
        dummyStash(this.con);
      }
    }

    if (message.type == "next") {
      //New Trade
      if (message.id == this.tradesSubscriptionId) {

        if (!this.withdrawActive) return;

        let data = message.payload.data.createTrade.trade;
        let item = data.tradeItems[0];

        if (item.markupPercent <= global.config.quick_filter_max_markup
          && item.value >= global.config.quick_filter_min_value
          && item.value <= global.config.quick_filter_max_value
          && item.value <= this.balance
          && quickfilterWhitelist(item.itemVariant.externalId)) {

          //not wasting any time here

          completeFastTrade(this.con, data.id);

          this.log(`Trying to withdraw at ${item.markupPercent}%`);
          return;
        }
      }

      //New Wallet Update
      if (message.id == this.walletSubscriptionId) {
        let wallet = message.payload.data.updateWallet.wallet;
        if (wallet.name == "MAIN") {
          this.balance = wallet.amount;

          //this.log("New balance:", this.balance);
        }
      }
    }

    if (message.payload != null && message.payload.errors) {
      message.payload.errors.forEach(async error => {
        this.log(error.message);

        if (error.message.includes("unauthenticated")) {
          this.log("Csgoroll session expired");

          if(global.config.auto_refresh_roll_session == false)  {
            console.log("Skipping new session for cluster socket due to configuration");
            this.reconnect = false;
            this.con.close();
            return;
          }

          let sess = await renewSession(this.domain);
          if (sess != null && sess != "") {
            this.session = sess;
            this.log(`New session created for ${this.domain} ${sess}`);
            global.clusterSessions[this.socketId].session = sess;

            updateSessionFile();

            this.connectClient();
          } else {
            console.log("Failed to renew session");
          }
        }

        //unsubscribe if trade is not joinable 
        if (error.message.includes("This withdrawal is no longer available") || error.message.includes("This trade is not joinable")) {
          unsubscribe(this.con, message.id);
        }

        if (error.message.includes("exceeds your daily withdrawal limit")) {
          this.log("Withdraw limit reached");
          this.withdrawActive = false;
        }
      });
    }
  }

  log(...args) {
    global.logWithoutDiscord(`${this.socketId}@${this.domain}`, ...args);
  }

  setupClient() {
    this.client = new WebSocketClient();

    let deez = this;

    this.client.on('connectFailed', function (error) {
      deez.log('Connect Error: ' + error.toString());
    });

    this.client.on('connect', function (connection) {

      deez.con = connection;
      deez.lastConnected = new Date();

      connection.on('error', function (error) {
        deez.log("Connection Error: " + error.toString());
      });

      connection.on('close', function (e) {
        deez.log('closed', e);

        if(!this.reconnect) return;
        deez.reconnectClient();
      });

      connection.on('message', function (message) {
        deez.handleMessage(message);
      });

      connection.sendUTF('{"type":"connection_init"}');
    });

    this.connectClient();
    this.initPingLoop();
  }

  constructor(domain, session, user, id) {
    this.balance = user.wallets[0].amount;
    this.domain = domain;
    this.session = session;
    this.socketId = id;
  }
}

function startCluster(_user) {
  let sessions = global.clusterSessions;
  console.log("Starting cluster for " + Object.keys(sessions).length + " sessions");

  for (let _key of Object.keys(sessions)) {
    let _id = _key;
    let _session = sessions[_key].session;
    let _domain = sessions[_key].domain;

    console.log("Starting Socket", `${_id}@${_domain}`);

    let rs = new RollSocket(_domain, _session, _user, _id);
    rs.setupClient();
    sockets.push(rs);
  }
}

function stopCluster() {
  console.log("Stopping " + sockets.length + " sessions");

  for(let rs of sockets) {
    rs.reconnect = false;
    rs.con.close();
  }

  sockets = [];
}

const sessionsFilepath = "cfg/cluster_sessions.json";

function updateSessionFile() {
  FS.writeFileSync(sessionsFilepath, JSON.stringify(global.clusterSessions));
}

module.exports = {
  startCluster,
  stopCluster
}