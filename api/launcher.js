const { startHeadlessScript } = require('./headless.js');
const { launchConfig } = require('./config.js');
const { startSteamService } = require('./steam.js');
const { genWhitelist } = require('./modules/filter.js')
const { checkLicenseValidity } = require('./modules/license.js');

process.on('uncaughtException', function (err) {
    console.error(err);
    console.log("Node NOT Exiting...");
});

let fs = require('fs');

const { sendDiscordMessage, setupDiscordHook } = require("./modules/discord.js");

function setupDiscord() {

    setupDiscordHook();

    console.logCopy = console.log.bind(console);

    global.logWithoutDiscord = function (...args) {
        let d = new Date();
        let millis = "" + d.getMilliseconds();
        while (millis.length < 3) {
            millis += "0";
        }

        let currentDate = '[' + d.toLocaleTimeString("de-DE") + ":" + millis + ']';
        console.logCopy(currentDate, ...args);
    }

    console.log = function (...args) {
        let d = new Date();
        let millis = "" + d.getMilliseconds();
        while (millis.length < 3) {
            millis += "0";
        }

        let currentDate = '[' + d.toLocaleTimeString("de-DE") + ":" + millis + ']';
        this.logCopy(currentDate, ...args);

        sendDiscordMessage("`" + d.toLocaleTimeString("de-DE") + "` " + args.join(" "));
    };
}

const configFilePath = "cfg/config.json";
const filterFilePath = "cfg/filters.json";
const secretsFilePath = "cfg/secrets.json"
const clusterFilePath = "cfg/cluster_sessions.json";
const whitelistFilePath = "cfg/whitelist.json";
const blacklistFilePath = "cfg/blacklist.json";
const sessionFilePath = "cfg/session.json";

function loadFile(path) {
    if (fs.existsSync(path)) {
        return JSON.parse(fs.readFileSync(path).toString("utf8"));
    }
    return null;
}

function loadConfig() {
    let _config = loadFile(configFilePath);

    if (_config == null) {
        console.log("Failed to load config file");
        process.exit(1);
    }

    global.config = _config;
}

function loadSecrets() {
    let _secrets = loadFile(secretsFilePath);

    if (_secrets == null) {
        console.log("Failed to load secrets file");
        process.exit(1);
    }

    global.secrets = _secrets;
}

function loadFilters() {
    let _filters = loadFile(filterFilePath);

    if (_filters == null) {
        console.log("Failed to load filter file");
        process.exit(1);
    }

    global.filters = _filters;
}

function loadWhitelist() {
    let _whitelist = loadFile(whitelistFilePath);

    if (_whitelist == null) {
        console.log("Failed to load whitelist file");
        process.exit(1);
    }

    global.whitelist = _whitelist;
}

function loadBlacklist() {
    let _blacklist = loadFile(blacklistFilePath);

    if (_blacklist == null) {
        console.log("Failed to load blacklist file");
        process.exit(1);
    }

    global.blacklist = _blacklist;
}

function loadClusterSession() {
    let _cluster = loadFile(clusterFilePath);

    if (_cluster == null) {
        console.log("Failed to load cluster file");
        process.exit(1);
    }

    global.clusterSessions = _cluster;
}

function loadSession() {
    let _session = loadFile(sessionFilePath);

    if (_session == null) {
        console.log("Failed to load session file");
        process.exit(1);
    }

    global.session = _session;
}

async function launch() {
    loadConfig();
    setupDiscord();
    loadSecrets();

    global.joinedTrades = {};

    global.blockedTrades = [];

    if (await checkLicenseValidity(true)) {
        console.log("Starting bot");
        loadFilters();
        loadWhitelist();
        loadBlacklist();
        loadSession();
        loadClusterSession();

        genWhitelist();

        launchConfig();
        startHeadlessScript();
        startSteamService();
    }
}

launch();