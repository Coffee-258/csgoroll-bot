const apiUrl = 'https://buff.163.com';
const axios = require('axios');
const proxy = require('https-proxy-agent');

const proxyAgent = new proxy.HttpsProxyAgent('proxy agent url');
  

const buffIds = require('./buff_ids.json');
const phaseIds = require('./phaseids.json');
const rates = require('./rates.json');

async function getListings(buffId, phaseId) {
    let url = `/api/market/goods/sell_order?game=csgo&goods_id=${buffId}&page_num=1&sort_by=default`;

    if(phaseId != null) {
        url += "&tag_ids=" + phaseId;
    }

    let buffResponse;

    console.log(url);

    buffResponse = await doBuffRequest(url, true);

    for(let i = 0; i < 5; i++) {
        buffResponse = await doBuffRequest(url, true);
        if(buffResponse != null && buffResponse != "error") {
            break;
        }
    }

    if(buffResponse == "error") {
        return null;
    }

    return buffResponse;
}

let buffcache = {};
const ONE_HOUR = 1000 * 60 * 60;

async function doBuffRequest(url, addCookies) {
    let _url = `${apiUrl}${url}`;

    let cacheData = buffcache[_url];

    if(cacheData != null && (new Date() - cacheData.time) < ONE_HOUR){
        return cacheData.data;
    }

    if(addCookies == null) {
        addCookies = false;
    }

    return new Promise(function (resolve) {
        axios
        .get(_url, {
            headers: addCookies? { "Cookie": `session=${global.config.buff_cookie};` } : null,
            httpsAgent: proxyAgent,
        }).then((response) => {

            if(response.status == 200 && response?.data != null) {
                buffcache[_url] = {
                    time: new Date(),
                    data: response?.data
                }
            }
            
            resolve(response?.data);
        }, (error) => {
            if(error == null || error.response == null) {
                console.log("BUFF error TIMEOUT");
                resolve("error");
            }
            console.log("BUFF error", error?.response?.status, error?.response?.statusText);
            resolve("error");
        });
    });
}

async function getCNYRate() {
    return new Promise(function (resolve, reject) {
        axios.get("https://openexchangerates.org/api/latest.json?app_id=" + exchangeRateApiKey).then((response) => {
            let exchangeRate = response.data?.rates?.CNY;
            resolve(exchangeRate);
        }, (error) => {
            reject(error);
        });
    });
}

function getRollConversion(itemName) {
    let rate
    if (itemName.includes('Doppler') | itemName.includes('Sapphire') | itemName.includes('Ruby')) {
        rate = 0.65;
    }else{
        rate = rates[itemName]
        if (rate === undefined) {
            rate = 0.66;
        }else{
            rate = rates[itemName].rate
        }
    }
    
    console.log("Rate for " + itemName + ": " + rate);
    return rate;
}

function roundToTwo(num) {
    return +(Math.round(num + "e+2")  + "e-2");
}

const exchangeRateApiKey = "api key";

async function getBuffPrice(id, phaseId) {
    let listings = await getListings(id, phaseId);

    let lowestListingPrice

    if(listings?.data?.items?.length > 0) {
        lowestListingPrice = listings?.data?.items[0]?.price;
    } else if(listings?.data?.items != null) {
        lowestListingPrice = -1;
    }

    return lowestListingPrice;
}

kniveTypes = ["knife","karambit","bayonet","daggers"];

const isKnife = (marketName) => {
    marketName = marketName.toLowerCase()
    if (kniveTypes.some((knifeType) => marketName.includes(knifeType))){
        return true;
    }
    return false;
}

const isDoppler = (marketName) => {
    return (marketName.includes('Doppler') || marketName.includes('Emerald') ||
        marketName.includes('Ruby') || marketName.includes('Black Pearl') ||
        marketName.includes('Sapphire')) && isKnife(marketName) ? true : false;
}

const refactorDopplerName = (marketName) => {
    const phaseMatch = /Phase (\d+)/;
    const gemMatch = /(Ruby|Sapphire|Black Pearl|Emerald)/;

    if (marketName.match(phaseMatch)) {
        let phase = marketName.match(phaseMatch)[0];
        let refactoredName = marketName.replace(phase+' ', '')
        return [refactoredName, phase]
    }else{
        if (marketName.match(gemMatch)) {
            let match = marketName.match(gemMatch)[0]
            if (match === 'Emerald') {
                let refactored = marketName.replace(match, 'Gamma Doppler');
                return [refactored, match];
            }else{
                let refactored = marketName.replace(match, 'Doppler');
                return [refactored, match];
            }
        }
    }
}

async function checkBuffPrice(itemName, coinValue, conversion) {
    let name = itemName;

    let buffPrice;

    let accurate = true;

    if(isDoppler(name)) {
        let nameFragments = refactorDopplerName(name);

        name = nameFragments[0];
        let phaseName = nameFragments[1];
        
        let dopplerData = phaseIds[name];
        let buffId = dopplerData.id;

        if(buffId == null) {
            console.log("No buff id found for " + name);
            return null;
        }

        let phaseId = dopplerData.phase[phaseName];

        if(global.config.buff_cookie != null && global.config.buff_cookie != "") {
            console.log(global.config.buff_cookie);

            buffPrice = await getBuffPrice(buffId, phaseId);
            if(buffPrice == null) {
                console.log("Failed loading buff price with buff_cookie. Check if the cookie is still valid.")
            }
        } else {
            accurate = false;
            buffPrice = await getBuffPrice(buffId);
        }
    } else {
        let buffId = buffIds[name];

        if(buffId == null) {
            console.log("No buff id found for " + name);
            return null;
        }

        buffPrice = await getBuffPrice(buffId);
    }

    if(buffPrice == null) {
        console.log("Couldn't load buff price for " + name);
        return null;
    }

    if(buffPrice == -1) {
        console.log("No " + name + " listed");
        return -1;
    }

    let rollConversion = getRollConversion(name);

    let rmbConversion = conversion == null ?  await getCNYRate() : conversion;

    let rollDollarPrice = coinValue * rollConversion;
    let buffDollarPrice = buffPrice / rmbConversion;
    let pricePercentage = roundToTwo(rollDollarPrice / buffDollarPrice * 100);

    global.logWithoutDiscord(`${name} is priced at ${pricePercentage}% of lowest buff listing. ${!accurate ? "Price might be inaccurate since no buff_cookie was supplied" : ''}`);

    return {
        pricePercentage: pricePercentage,
        rollDollarPrice: rollDollarPrice,
        buffDollarPrice: buffDollarPrice,
        accurate: accurate
    }
}

async function getBuffPriceByItems(items) {
    let ret = [];

    let rmbConversion = await getCNYRate();

    if(rmbConversion == null) {
        console.log("Error getting currency exchange rates");
        return [];
    }

    let promises = [];

    for(let item of items) {
        promises.push(new Promise(async (resolve) => {
            let name = item.hashName;
            let price = item.price;
    
            let data = await checkBuffPrice(name, price, rmbConversion);
            
            if(data != null) {
                if(data == -1) {
                    ret.push({
                        id: item.id,
                        buffDollarPrice: -1,
                        pricePercentage: -1
                    });
                } else {
                    ret.push({
                        id: item.id,
                        buffDollarPrice: roundToTwo(data.buffDollarPrice),
                        pricePercentage: data.pricePercentage,
                        accurate: data.accurate
                    });
                }

               
                resolve();
            } else {
                ret.push({
                    id: item.id
                });
                resolve();
            }
        }));
    }

    await Promise.all(promises);

    return ret;
}

function refactorName(name) {
    if(isDoppler(name)) {
        let nameFragments = refactorDopplerName(name);
        name = nameFragments[0];
    }

    return name;
}

async function initBuffCheck(trade) {
    return await checkBuffPrice(trade.itemName, trade.totalValue);
}

module.exports = {
    initBuffCheck,
    getBuffPriceByItems,
    refactorName
}