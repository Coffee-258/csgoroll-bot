const FS = require("fs");

const dataFolder = 'api/data/';

function getTrades() {
    let trades = [];

    FS.readdirSync(dataFolder).forEach(file => {
        if (file.startsWith("trades")) {
            let parsed = JSON.parse(FS.readFileSync(dataFolder + "" + file).toString("utf8"));
            for (let t of parsed) {
                trades.push(t);
            }
        }
    });

    return trades;
}

module.exports = {
    getTrades
}