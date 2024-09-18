const fs = require('fs');

const tradesFilePath = "./api/data/trades.json";
const balanceFilePath = "./api/data/balance.json";
const historyFilePath = "./api/data/trades.json";

const historyFileTemplate = "./api/data/trades-";

async function createFileIfNotExists(filename, defaultString) {
    return new Promise((resolve, reject) => {
        fs.open(filename, 'r', function (err, fd) {
            if (err) {
                fs.writeFile(filename, defaultString ?? '', function (err) {
                    console.log(filename + " created.");
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });

}

let writing = false;
async function addBalanceLog(balance) {
    if(writing) return;
    writing = true;
    await createFileIfNotExists(balanceFilePath, "[]");
    let fileContent = fs.readFileSync(balanceFilePath).toString("utf8");
    let balanceLog = fileContent != null && fileContent != "" ? JSON.parse(fileContent) : [];

    balanceLog.push({
        date: new Date(),
        balance: balance
    });

    while (balanceLog.length > 200) {
        balanceLog.shift();
    }

    try {
        JSON.parse(JSON.stringify(balanceLog))

        fs.writeFileSync(balanceFilePath, JSON.stringify(balanceLog), (err) => {
            if (err) {
                console.log(err);
            }
        });
        writing = false;
    } catch (e) {
        console.log("JSON data corrupted for new trade entry ", balanceLog);
    }


}

function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

function createHistoryFilename() {
    let name = new Date().toJSON().slice(0,10);
    name += "-" + makeid(4);
    return name;
}

//maybe try to prevent concurrent writing in the future
async function createTradeRecord(data) {
    await createFileIfNotExists(tradesFilePath, "[]");

    let fileContent = fs.readFileSync(historyFilePath).toString("utf8");

    //json parse macht immer noch trouble
    let historyLog = fileContent != null && fileContent != "" ? JSON.parse(fileContent) : [];

    try {
        //sometimes the data is corrupted so if this works we should get a usable format at all times
        JSON.parse(JSON.stringify(data));
        historyLog.push(data);
    } catch(e) {
        console.log("JSON data corrupted for new trade entry ", data);
    }

    fs.writeFileSync(historyFilePath, JSON.stringify(historyLog), (err) => {
        if (err) {
            console.log(err);
        }
    });

    let stats = fs.statSync(historyFilePath);
    let fileSizeInBytes = stats.size;

    let fileSizeInMegabytes = fileSizeInBytes / (1000*1000);

    if(fileSizeInMegabytes >= 1) {
        console.log("Trades log filesize too big, creating empty file");
        fs.rename(historyFilePath, historyFileTemplate + createHistoryFilename() + ".json", function(err) {
            if ( err ) {
                console.log('ERROR: ' + err);
            } else {
                createFileIfNotExists(tradesFilePath, "[]");
            }
        });
    }
}

module.exports = {
    addBalanceLog,
    createTradeRecord
};