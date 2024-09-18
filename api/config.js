function launchConfig() {
    const FS = require("fs");
    const express = require("express");
    const cors = require('cors');
    const bodyParser = require('body-parser');
    const app = express();
    const port = 3020;

    const { getTrades } = require('./modules/tradeLoader');
    const { getFullInventory } = require("./modules/inventory")
    const { getBuffPriceByItems } = require("./buff_check")
    const { sendInvetoryUpdate } = require("./headless")

    let server = require('http').createServer(app);

    let serverPort = 8080;

    let TWELVE_HOURS = 12 * 60 * 60 * 1000;
    let SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    server.listen(serverPort);


    app.use(express.static(__dirname + '/web'));

    const configFilePath = "cfg/config.json";
    const filterFilePath = "cfg/filters.json";
    const blacklistFilePath = "cfg/blacklist.json";
    const whitelistFilePath = "cfg/whitelist.json";
    const historyFilePath = "api/data/trades.json";
    const balanceFilePath = "api/data/balance.json";
    const inventoryFilePath = "api/data/value.json";

    async function createFileIfNotExists(filename, defaultString) {
        return new Promise((resolve, reject) => {
            FS.open(filename, 'r', function (err, fd) {
                if (err) {
                    FS.writeFile(filename, defaultString ?? '', function (err) {
                        console.log(filename + " created.");
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    
    }

    //const errorInterceptor = require("../helpers/error-interceptor")
    //errorInterceptor("Config API");

    // create application/json parser
    const jsonParser = bodyParser.json({ limit: '50mb' });
    app.use(jsonParser);

    app.use(cors({ origin: '*' }));

    app.listen(port, () => {
        console.log(`Config API started`);
    });

    app.get("/ping", (req, res) => {
        res.send("pong");
    });

    function loadFile(path) {
        if (FS.existsSync(path)) {
            return JSON.parse(FS.readFileSync(path).toString("utf8"));
        } else {
            createFileIfNotExists(path, "[]");
        }
        return null;
    }

    function loadFilterFile() {
        return loadFile(filterFilePath);
    }

    function loadInventoryFile() {
        return loadFile(inventoryFilePath) ?? [];
    }

    function loadBlacklistFile() {
        return loadFile(blacklistFilePath);
    }

    function loadWhitelistFile() {
        return loadFile(whitelistFilePath);
    }

    function loadConfigFile() {
        return loadFile(configFilePath);
    }

    function loadBalanceFile() {
        return loadFile(balanceFilePath);
    }

    function createValueLog(value) {
        let log = loadInventoryFile();

        if(log?.length == 0 || log[log.length - 1].value != value) {
           let e = {
                date: new Date(),
                value: value
            };

            log.push(e);
            sendInvetoryUpdate(e);
    
            FS.writeFileSync(inventoryFilePath, JSON.stringify(log));
        }      
    }

    function arrayEquals(a, b) {
        return Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((val, index) => val === b[index]);
    }

    app.post('/update-filters', jsonParser, function (req, res) {
        let blacklist = req.body.blacklist;
        let filters = req.body.filters;

        if (!arrayEquals(loadBlacklistFile(), blacklist)) {
            FS.writeFileSync(whitelistFilePath, "[]");
            console.log("Blacklist changed. Deleted whitelist");
        }

        if (blacklist != null) {
            FS.writeFileSync(blacklistFilePath, JSON.stringify(blacklist));
        } else {
            console.log("Cant update blacklist", blacklist);
        }

        if (filters != null) {
            FS.writeFileSync(filterFilePath, JSON.stringify(filters));
        } else {
            console.log("Cant update filters", filters);
        }


        res.send({ status: 'SUCCESS' });
    })

    app.post('/update-whitelist', jsonParser, function (req, res) {
        let whitelist = req.body;

        FS.writeFileSync(whitelistFilePath, JSON.stringify(whitelist));

        res.send({ status: 'SUCCESS' });
    });

    app.get("/get-config-initial", (req, res) => {
        let ret = {};

        ret.filters = loadFilterFile();
        ret.inventory = loadInventoryFile();
        ret.blacklist = loadBlacklistFile();
        ret.config = loadConfigFile();
        ret.config.roll_user_id = global.license.roll_user_id;
        ret.whitelist = loadWhitelistFile();
        ret.user = global.rollUser;

        res.send(ret);
    });

    async function loadInventory() {
        let inventory = await getFullInventory();
        
        let price = 0;

        for(let item of inventory) {
            price += item.itemVariant.value;
        }

        let balance = global?.balance ?? 0;
        let value = balance + price;
        createValueLog(value);

        return inventory;
    }

    app.get("/get-inventory", async (req, res) => {
        let ret = {};

        ret.inventory = await loadInventory();
        res.send(ret);
    });

    app.post('/price-items', jsonParser, async function (req, res) {
        let items = req.body;

        let ret = await getBuffPriceByItems(items);

        res.send(ret);
    })

    app.get("/get-data", (req, res) => {
        let ret = {};

        let _history = getTrades();

        let history = [];


        for (let _h of _history ?? []) {
            if (((new Date) - new Date(_h.updatedAt)) < (SEVEN_DAYS * 4) && _h.depositor != null && _h.withdrawer != null) {
                history.push(_h);
            }
        }

        let _balance = loadBalanceFile();
        let balance = [];

        for (let _b of _balance ?? []) {
            if (((new Date) - new Date(_b.date)) < TWELVE_HOURS) {
                balance.push(_b);
            }
        }

        ret.balance = balance;
        ret.history = history.reverse();
        res.send(ret);
    });

    setInterval(() => {
        console.log("Loading inventory for value graph");
        loadInventory();
    }, 60 * 1000 * 60);
}

module.exports = {
    launchConfig
}