let cfgUrl = "http://localhost:3020";

let withdrawActive = false;
let depositActive = false;

let filters = null;
let blacklist = [];

let whitelist = new Map();
let blacklistMap = new Map();

let config = null;
let configLoaded = false;
let socket;

let balanceChart;
let inventoryChart;
let depositWithdrawChart;
let depositWithdrawTotalChart;
let daytimeChart;

let hasFirstTrade = false;

let allTrades = [];
let allWithdraws = {};

let receivedLogs = false;

let placeholderSkinImage = '/images/placeholder.png';

const dateOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
};

function timeDifference(current, previous) {
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;

    const elapsed = current - previous;

    if (elapsed < msPerMinute) {
        return 'now';
    }

    else if (elapsed < msPerHour) {
        return Math.round(elapsed / msPerMinute) + 'm';
    }

    else if (elapsed < msPerDay) {
        return Math.round(elapsed / msPerHour) + 'h';
    }

    else {
        return Math.round(elapsed / msPerDay) + 'd';
    }
}

function sendRollWs(msg) {
    socket.send(JSON.stringify({
        type: "send-roll-socket",
        msg: msg
    }));
}

function sendFilterToSocket() {
    socket.send(JSON.stringify({
        type: "update-filters",
        filters: filters
    }));
}

function getStickerPrice(data) {
    let stickerprice = 0;

    if (data.tradeItems[0].stickers == null) return "?";

    for (let sticker of data.tradeItems[0].stickers) {
        stickerprice += sticker.value;
    }

    return round2Decimals(stickerprice);
}

function createTradeDataTable(data) {
    let hasStickers = data.tradeItems[0].stickers.length > 0;
    let stickerprice = getStickerPrice(data);

    return `<div class='trade-data-table'>
        <div class='trade-data-row'>
            <div class='trade-data-column'>Price: ${data.tradeItems[0].value}</div>
            <div class='trade-data-column'>Markup: ${data.tradeItems[0].markupPercent}%</div>
        </div>
        <div class='trade-data-row'>
            <div class='trade-data-column'>Float: ${data.avgPaintWear != null ? data.avgPaintWear : "-"}</div>
            ${hasStickers ? `<div class='trade-data-column'>Sticker: ${round2Decimals(stickerprice)}</div>` : ""}
            </div>
    </div>`;
}

function createLiveTradeElement(data) {
    let tradeId = data.id;
    let isDeposit = data.depositor.id == config.roll_user_id;

    let statusText = data.status[0] + data.status.slice(1).toLowerCase();

    if (data.status == "CANCELLED" && isDeposit) {
        return;
    }

    $("#live-trades").prepend(
        `<div class="live-trade-item ${isDeposit ? "live-trade-deposit" : "live-trade-withdraw"} ${statusText.toLowerCase()}" data-tradeId="${tradeId}">
            <div class="live-trade-header" title="${data.tradeItems[0].marketName}">${data.tradeItems[0].marketName}</div>
            <div class="live-trade-detail-wrapper">
                <!--<div class="live-trade-img-wrapper"><img src="${data.tradeItems[0].itemVariant.iconUrl != "NULL" ? data.tradeItems[0].itemVariant.iconUrl : placeholderSkinImage}"></div>-->
                <div class='trade-data-table'>
                    <div class='trade-data-column'>Status:</div><div class="trade-data-column live-trade-status green-text">${statusText}</div>
                </div>
                ${createTradeDataTable(data)}
                <div class="live-trade-progress-bar">
                    <div class="progress"></div>
                </div>
            </div>
        </div>`
    );

    if ($("#live-trade-dummy-item").length > 0) {
        $("#live-trade-dummy-item").remove();
    }

    let t = $("div[data-tradeId='" + tradeId + "']");
}

function updateLiveTradeElement(data) {
    let tradeId = data.id;
    let t = $("div[data-tradeId='" + tradeId + "']");

    let statusText = data.status[0] + data.status.slice(1).toLowerCase();

    $(t).removeClass("joined").removeClass("processing").removeClass("cancelled").removeClass("completed").addClass(statusText.toLowerCase());
    $(t).find(".live-trade-status").html(statusText);
}

function connectSocket() {
    socket = new WebSocket("ws:localhost:3012");

    socket.onmessage = async (event) => {
        let message = JSON.parse(event.data);
        if (message.type == "balance-update") {

            if(balanceChart == null) return;

            balanceChart.data.datasets.forEach((dataset) => {
                dataset.data.push(createDataFromBalance([message.data])[0]);
            });

            balanceChart.update('none');

            updateBalanceText(message.data.balance);
        }

        if (message.type == "inventory-update") {

            const formattedDate = new Date(message.data.date).toISOString().substring(0, 10);
    
            // Add the new data point to the chart's dataset
            inventoryChart.data.labels.push(formattedDate);
            inventoryChart.data.datasets[0].data.push(round2Decimals(message.data.value));

            inventoryChart.update('none');
        }

        if(message.type == "updated-deposit") {
            depositActive = message.data.status;

            depositToggled();
        }

        if(message.type == "updated-withdraw") {
            withdrawActive = message.data.status;

            withdrawToggled();
        }

        if (message.type == "trade-update") {
            let trade = message.data;
            if (trade.depositor != null && trade.depositor.id != config.roll_user_id) {
                allWithdraws[trade.tradeItems[0].marketName + "|" + trade.avgPaintWear] = trade;
            } else {
                let w;

                if (trade.avgPaintWear != null) {
                    w = allWithdraws[trade.tradeItems[0].marketName + "|" + trade.avgPaintWear];
                } else if (trade.tradeItems[0].steamExternalAsset?.steamInspectItem?.paintWear != null) {
                    w = allWithdraws[trade.tradeItems[0].marketName + "|" + trade.tradeItems[0].steamExternalAsset?.steamInspectItem?.paintWear];
                } else {
                    w = allWithdraws[trade.tradeItems[0].marketName + "|" + 0];
                }

                $("#trade-history-list").prepend(createTradeHistoryElement(trade, w));
            }

            allTrades.push(trade);

            updateStatsText();
            updateDaytimeChart();

            if (!hasFirstTrade) {
                updateSinceTimestamp(message.data);
            }
        }

        if (message.type == "trade-status") {
            let data = message.data;

            let tradeId = data.id;

            if ($("div[data-tradeId='" + tradeId + "']").length == 0) {
                createLiveTradeElement(data);
            } else {
                updateLiveTradeElement(data);
            }
        }
    };

    socket.onopen = (event) => {
        $("#activity-dot").addClass("active");
        $("#favicon").attr("href", "/images/favicon_active.png");
        $("#status-span-disconnected").hide();
        $("#status-span-connected").show();
    }

    socket.onclose = (event) => {
        $("#activity-dot").removeClass("active");
        $("#favicon").attr("href", "/images/favicon_inactive.png");
        $("#status-span-disconnected").show();
        $("#status-span-connected").hide();

        setTimeout(function () {
            connectSocket();
        }, 1000);
    }
}

let tws;

let skipNewTws = false;

let pingInterval;

function setupTradeTracker() {
    tws = new WebSocket("wss://api.csgorolltr.com/graphql", ["graphql-transport-ws"]);

    tws.onopen = () => {
        tws.send(`{"type": "connection_init"}`);

        setTimeout(() => {
            tws.send(`{"id":"0","type":"subscribe","payload":{"variables":{},"extensions":{},"operationName":"OnCreateTrade","query":"subscription OnCreateTrade($userId: ID) {  createTrade(userId: $userId) {    trade {      ...Trade      __typename    }    __typename  }}fragment Trade on Trade {  id  status  steamAppName  cancelReason  canJoinAfter  markupPercent  createdAt  depositor {    id    steamId    avatar    displayName    steamDisplayName    online    __typename  }  depositorLastActiveAt  expiresAt  withdrawerSteamTradeUrl  customValue  withdrawer {    id    steamId    avatar    displayName    steamDisplayName    __typename  }  totalValue  updatedAt  tradeItems {    id    marketName    value    customValue    itemVariant {      ...ItemVariant      __typename    }    markupPercent    stickers {      ...SimpleSticker      __typename    }    steamExternalAssetId    __typename  }  trackingType  suspectedTraderCanJoinAfter  joinedAt  avgPaintWear  hasStickers  __typename}fragment ItemVariant on ItemVariant {  id  itemId  name  brand  iconUrl  value  displayValue  externalId  color  rarity  depositable  __typename}fragment SimpleSticker on TradeItemSticker {  value  imageUrl  brand  name  color  wear  __typename}"}}`);
        }, 500);

        pingInterval = setInterval(() => {
            tws.send('{"type":"ping","payload":{}}'); 
        }, 50000);
    };

    tws.onclose = () => {
        tws = null;
        clearInterval(pingInterval);
        if(skipNewTws) {
            skipNewTws = false;
            return;
        }
        setupTradeTracker();
    }

    tws.onmessage = (msg) => {
        if(msg.data == null) return;

        let message = JSON.parse(msg.data);
        if(message.id == 0) {
            let t = message.payload.data.createTrade.trade;
            if(t == null) return;

            let name = t.tradeItems[0].marketName;
            let price = t.totalValue;
            let markup = t.markupPercent;
            let icon = t.tradeItems[0].itemVariant.iconUrl != "NULL" ? t.tradeItems[0].itemVariant.iconUrl : placeholderSkinImage;

            if(markup > maxTrackerMarkup) return;
            if(price < trackerMin || price > trackerMax) return;

            let date = t.createdAt;

            $("#trade-tracker-content").prepend(`
                <div class="tracker-item" data-markup="${markup}" data-price="${price}">
                    <div class="tracker-img-wrapper">
                        <img class="tracker-icon" width="30" src="${icon}">
                    </div>
                    <div class="tracker-info-wrapper">
                        <div class="tracker-name-wrapper">
                            <span class="tracker-name">${name}</span>
                        </div>
                        <div class="tracker-detail-wrapper">
                            <div class="tracker-price-wrapper">
                                <img class="coin-icon" src="images/coin.webp" height="16" width="16">
                                <span class="tracker-price">${price}</span>
                            </div>
                            <span class="tracker-markup">${markup}%</span>
                        </div>
                    </div>
                    <div class="tracker-date-wrapper">
                        <span>${date}</span>
                        <span class='tracker-ago update-date-timestamp' data-date='${date}'>${timeDifference(new Date, new Date(date))}</div>
                    </div>
                </div>
            `);
        }
    };
}

let maxTrackerMarkup = 0;
let trackerMin = 100;
let trackerMax = 1000;

function changeMarkupTracker(val) {
    maxTrackerMarkup = parseInt(val);
    $("#markup-range").html(val);
} 

function checkTrackerItems() {
    $(".tracker-item").each(function() {
        let markup = $(this).attr("data-markup");
        let price = $(this).attr("data-price");

        if(markup > maxTrackerMarkup || price < trackerMin || price > trackerMax) {
            $(this).remove();
        }
    });
}

function withdrawToggled() {
    if(withdrawActive) {
        $("#status-withdraw").addClass("active");
    } else {
        $("#status-withdraw").removeClass("active");
    }
}

function depositToggled() {
    if(depositActive) {
        $("#status-deposit").addClass("active");
    } else {
        $("#status-deposit").removeClass("active");
    }
}

async function loadRollInventory() {
    selectedInventoryItems = [];
    loadInventory().then((inv) => {
        $("#inventory-dialog-wrapper").removeClass("loading");

        let price = 0;

        for(let item of inv.inventory) {

            let doppler = isDoppler(item.itemVariant.externalId);

            price += item.itemVariant.value;

            $("#inventory-items").append(`
                <div class="inventory-item" data-priced="false" data-externalId="${item.itemVariant.externalId}" data-id="${item.steamItemIdentifiers.assetId}" data-price="${item.itemVariant.value}">
                    <div class="inventory-item-price-loading">
                        <span class="loader active"></span>
                    </div>
                    ${!item.tradable || doppler ? 
                        `<div class="inventory-item-tradelock-wrapper" title="Tradelock active">
                            ${!item.tradable ? `<span class="material-icons">
                                lock
                            </span>`: ''}
                            ${doppler ? `
                            <div class="doppler-phase">
                                <span>${getPhaseName(item.itemVariant.externalId)}</span>
                            </div>` : ''}
                            
                        </div>`
                    : ''}
                    
                    <div class="inventory-item-img-wrapper">
                        <img src="${item.itemVariant.iconUrl != "NULL" ? item.itemVariant.iconUrl : placeholderSkinImage}">
                    </div>
                    <div class="inventory-item-name-wrapper">
                        <span>${item.itemVariant.brand}</span>
                        <span class="bold">${item.itemVariant.name != null && item.itemVariant.name != "" ? item.itemVariant.name : "Vanilla"}</span>
                    </div>
                    <div>
                        <div class="tracker-price-wrapper">
                            <img class="coin-icon" src="images/coin.webp" height="16" width="16">
                            <span class="tracker-price">${item.itemVariant.value}</span>
                        </div>
                    </div>
                    ${
                        item.steamInspectItem?.paintWear != null ? 
                        `<div class="inventory-float-wrapper">
                            ${createFloatSlider(item.steamInspectItem?.paintWear)}
                        </div>
                        <div>
                            <span class="inventory-float-text">
                                ${`${item.steamInspectItem?.paintWear}`.substring(0, 7)}
                            </span>
                            <span class="inventory-item-wear">
                                ${item.itemVariant.color != null ? item.itemVariant.color : "Not Painted"}
                            </span>
                        </div>`
                        : ''
                    }
                    ${
                        item.steamStickersDescriptions.length > 0 ?
                        `<div class="inventory-item-sticker-wrapper">${createStickerElements(item.steamStickersDescriptions)}</div>` : ''
                    }
                    <div class="inventory-buff-price-wrapper">
                        <span class="material-icons">
                        sell
                        </span>
                        <span class="buff-price-ratio"></span>
                        <span class="buff-dollar-price"></span>
                    </div>
                </div>
            `);
        }

        $("#inventory-total").html(round2Decimals(price));
    });
}

let selectedInventoryItems = [];

$(document).ready(function () {

    connectSocket();

    $("#live-trades-control .live-trades-toggle").click(function() {
        let className = $(this).attr("data-class");
        $(this).toggleClass("active");
            $("#live-trades").addClass(className);
        if($(this).hasClass("active")) {
            $("#live-trades").removeClass(className);
        }
    });

    $("#inventory-select-10").click(function() {
        let amountOfSelected = selectedInventoryItems.length;

        let maxSelect = 10;

        if(amountOfSelected < 10) {
            let items = $(".inventory-item:not(.selected)[data-priced='false']");
            
            let amountToSelect = maxSelect - amountOfSelected;

            for(let i = 0; i < amountToSelect; i++) {
                let item = items[i];
                $(item).click();
            }
        }
    });

    $("#inventory-wrapper").on("click", ".inventory-item", function () {
        $(this).toggleClass("selected");

        if($(this).hasClass("selected")) {
            selectedInventoryItems.push({
                id: $(this).attr("data-id"),
                hashName: $(this).attr("data-externalId"),
                price: $(this).attr("data-price")
            });
        } else {
            let id = $(this).attr("data-id");
            selectedInventoryItems = selectedInventoryItems.filter(function (el) {
                return el.id != id
            });
        }
    });

    $("#refresh-inventory").click(async function() {
        $("#inventory-items").empty();
        $("#inventory-dialog-wrapper").addClass("loading");
        loadRollInventory();
    });

    $("#nav-inventory-toggle").click(function() {
        $(this).toggleClass("active");
        if($(this).hasClass("active")) {
            $("#inventory-dialog")[0].show();

            if($("#inventory-dialog-wrapper").hasClass("loading")) {
                loadRollInventory();
            }
        } else {
            $("#inventory-dialog")[0].close();
        }
    });

    $("#inventory-load-price").click(function() {
        if(selectedInventoryItems.length > 10) {
            alert("Please select a maximum of 10 items at once");
            return;
        }

        $(".inventory-item.selected").each(function() {
            $(this).addClass("loading");
        });

        $.ajax({
            url: cfgUrl + "/price-items",
            type: "POST",
            crossDomain: true,
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify(selectedInventoryItems)
        }).done(function (response) {
            selectedInventoryItems = [];
            $(".inventory-item").each(function() {
                if($(this).hasClass("selected")) {
                    $(this).removeClass("loading");
                    $(this).removeClass("selected");
                }
            });

            for(let item of response) {
                let i = $(".inventory-item[data-id='" + item.id +"']");

                if(item.buffDollarPrice != null && item.pricePercentage != null) {
                    if(item.pricePercentage != -1) {
                        $(i).find(".buff-price-ratio").html(item.pricePercentage + "%");
                        $(i).find(".buff-dollar-price").html("$" + item.buffDollarPrice);
                    } else {
                        $(i).find(".buff-price-ratio").html("Not listed");
                    }

                    $(i).attr("data-priced", true);

                    if(item.accurate == false) {
                        $(i).addClass("inaccurate");
                    }
                } else {
                    $(i).find(".buff-price-ratio").html("No price found");
                }
            }
        });
    });

    $("#modal-click-receiver").click(function() {
        $("#nav-inventory-toggle").click();
    });

    $("#menu-toggle-wrapper").click(function() {
        $(this).toggleClass("opened");
        if($(this).hasClass("opened")) {
            $("#hamburger-toggled-menu").show();
        } else {
            $("#hamburger-toggled-menu").hide();
        }
    });

    $("#nav-tracker-toggle").click(function() {
        $(this).toggleClass("active");

        if($(this).hasClass("active")) {
            $("#trade-tracker-wrapper").show();
        } else {
            $("#trade-tracker-wrapper").hide();
        }
    });

    $("#clear-tracker").click(function() {
        $("#trade-tracker-content").empty();
    });

    $("#trade-tracker-toggle").click(function() {
        if(tws == null) {
            setupTradeTracker();
            $(this).html("Stop");
            $("#trade-listening-loader").addClass("active");
        } else {
            skipNewTws = true;
            tws.close();
            tws = null;
            $(this).html("Start");
            $("#trade-listening-loader").removeClass("active");
        }
    });

    $("#script-filter-wrapper.loading").click(function () {
        loadConfig();
    });

    $("#tracker-min").change(function() {
        checkTrackerItems();
    });

    $("#tracker-max").change(function() {
        checkTrackerItems();
    })

    $("#markup-trade-tracker").change(function() {
        checkTrackerItems();
    });

    $("#tracker-min").on("input", function() {
        trackerMin = parseInt($(this).val());
    });

    $("#tracker-max").on("input", function() {
        trackerMax = parseInt($(this).val());
    });

    $("#change-withdraw-activity").click(function () {
        socket.send(JSON.stringify({
            type: "toggle-withdraw"
        }));
    });

    $("#change-deposit-activity").click(function () {
        socket.send(JSON.stringify({
            type: "toggle-deposit"
        }));
    });

    $("#script-filter-wrapper").on("click", ".filter-input-wear > div", function (e) {
        $(this).toggleClass("selected");
    });

    $("#script-filter-wrapper").on("click", ".save-filters", function (e) {

        if ($(".float-range-wrapper input.error").length > 0) {
            alert("Fix float slider errors first");
            return;
        }

        initFilterVariables();

        //save to file
        postFilterVariables();

        sendFilterToSocket();

        $("#script-filter-wrapper").hide();
    });

    $("#script-filter-wrapper").on("click", ".remove-filter", function (e) {
        $(this).parent().remove();
    });

    $("#script-filter-wrapper").on("input", ".float-slider input", function (e) {
        let isMinInput = $(this).hasClass("input-min");
        let min = $(this).closest(".float-input-wrapper").attr("data-min");
        let max = $(this).closest(".float-input-wrapper").attr("data-max");
        let maxValue = $(this).closest(".float-input-wrapper").find("input.input-max").val();
        let minValue = $(this).closest(".float-input-wrapper").find("input.input-min").val();

        let inputInvalid = false;

        if (isMinInput) {
            if (minValue < min || minValue > maxValue) {
                inputInvalid = true;
                $(this).addClass("error");
            } else {
                $(this).removeClass("error");
            }
        } else {
            if (maxValue > max || maxValue < minValue) {
                inputInvalid = true;
                $(this).addClass("error");
            } else {
                $(this).removeClass("error");
            }
        }

        if (!inputInvalid) {
            $("#float-range-indicator .float-segment").each(function () {
                let deez = this;
                let sliderMin = $(deez).attr("data-min");
                let sliderMax = $(deez).attr("data-max");
                let inputWrapper = $("#float-slider-" + $(deez).attr("data-wear"));
                let min = $(inputWrapper).find("input.input-min").val();
                let max = $(inputWrapper).find("input.input-max").val();

                $(deez).find(".cover-start").css({ "width": Math.abs((100 / (sliderMax - sliderMin) * (sliderMin - min))) + "%" });

                $(deez).find(".cover-end").css({ "width": Math.abs((100 / (sliderMax - sliderMin) * (sliderMax - max))) + "%" });

            });
        }
    });

    $("#open-settings").click(function () {
        $("#script-filter-wrapper").show();
    });

    $("#clickable-background, #close-filters").click(function () {
        $("#script-filter-wrapper").hide();
    });

    $("#script-filter-wrapper").on("click", "#add-sticker-filter", function (e) {
        if ($("#sticker-filter-wrapper .filter-wrapper").length < 10) {
            $("#sticker-filter-wrapper").append(createFilterElement(true, "Katowice 2014", 20, 1000, 3, true, false, false, true, true, true, true, true, true, false, true, true));
        }
    });

    $("#script-filter-wrapper").on("click", "#add-specific-filter", function (e) {
        if ($("#specific-filter-wrapper .filter-wrapper").length < 10) {
            $("#specific-filter-wrapper").append(createFilterElement(true, "Knife", 20, 1000, 3, true, false, false, true, true, true, true, true, true, false, false, false));
        }
    });

    loadConfig();
});

function postFilterVariables() {

    let data = {};

    data.filters = filters;
    data.blacklist = blacklist;

    console.log(data);

    $.ajax({
        url: cfgUrl + "/update-filters",
        type: "POST",
        crossDomain: true,
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify(data)
    }).done(function () {
        console.log("Updated Filters in API");
    });
}

function initFilterVariables() {
    let tmpFilters = {};
    tmpFilters.general = [];
    tmpFilters.stickers = [];
    tmpFilters.specific = [];

    let generalHeader = $("#table-general");
    let stickerHeader = $("#table-sticker");
    let specificHeader = $("#table-specific");

    tmpFilters.generalsUseCustomFloat = $(generalHeader).find(".use-custom-float").is(":checked");
    tmpFilters.stickerUseCustomFloat = $(stickerHeader).find(".use-custom-float").is(":checked");
    tmpFilters.specificUseCustomFloat = $(specificHeader).find(".use-custom-float").is(":checked");

    let fnWrapper = $("#float-slider-fn");
    let mwWrapper = $("#float-slider-mw");
    let ftWrapper = $("#float-slider-ft");
    let wwWrapper = $("#float-slider-ww");
    let bsWrapper = $("#float-slider-bs");

    tmpFilters.fnMin = fnWrapper.find(".input-min").val();
    tmpFilters.fnMax = fnWrapper.find(".input-max").val();

    tmpFilters.mwMin = mwWrapper.find(".input-min").val();
    tmpFilters.mwMax = mwWrapper.find(".input-max").val();

    tmpFilters.ftMin = ftWrapper.find(".input-min").val();
    tmpFilters.ftMax = ftWrapper.find(".input-max").val();

    tmpFilters.wwMin = wwWrapper.find(".input-min").val();
    tmpFilters.wwMax = wwWrapper.find(".input-max").val();

    tmpFilters.bsMin = bsWrapper.find(".input-min").val();
    tmpFilters.bsMax = bsWrapper.find(".input-max").val();

    tmpFilters.general.push(extractFilterFromDom($("#general-filter-wrapper  .filter-wrapper")));
    $("#sticker-filter-wrapper .filter-wrapper").each(function () {
        tmpFilters.stickers.push(extractFilterFromDom($(this)));
    });

    $("#specific-filter-wrapper .filter-wrapper").each(function () {
        tmpFilters.specific.push(extractFilterFromDom($(this)));
    });

    filters = tmpFilters;

    let lines = $("#blacklist-textarea").val().split("\n");
    let tmpBlacklist = [];

    for (let i = 0; i < lines.length; i++) {
        let text = lines[i].trim();
        if (text != "") {
            tmpBlacklist.push(text);
        }
    }

    console.log("Blacklist Updated", tmpBlacklist);

    blacklist = tmpBlacklist;
}

function getIntMax(max) {
    return Math.floor(Math.random() * max);
}

function createStickerElements(stickers) {
    let ret = "";
    for (let sticker of stickers) {
        ret += `<div class='trade-item-sticker'
        title='${sticker.name + (sticker.color != null ? " (" + sticker.color + ")" : "") 
        + (sticker.wear != null ? "\nCondition: " + Math.floor((1 - sticker.wear) * 100) + "%" : "")
        + (sticker.value != null ? "\nValue: " + sticker.value: "")}'>
        <img style='opacity: ${Math.max(1 - sticker.wear, 0.2)}' src='${sticker.imageUrl}'></div>`;
    }

    return ret;
}

function createFloatSlider(float) {
    return `<div class='float-range-indicator'>
        <div class='float-segment' data-wear='fn' id='float-segment-fn'
            style='width:7%; background-color: #2fa1b0;'>
        </div>
        <div class='float-segment' data-wear='mw' id='float-segment-mw'
            style='width:8%; background-color: #78b320;'>
        </div>
        <div class='float-segment' data-wear='ft' id='float-segment-ft'
            style='width:23%; background-color: #e4be3a;'>
        </div>
        <div class='float-segment' data-wear='ww' id='float-segment-ww'
            style='width:7%; background-color: #fd8037;'>
        </div>
        <div class='float-segment' data-wear='bs' id='float-segment-bs'
            style='width:55%; background-color: #fc4038;'>
        </div>
    </div><div style='left:${100 * float}%' class='float-pointer'></div>`;
}

function createDataFromBalance(balance) {
    let data = [];
    for (b of balance) {
        data.push({
            x: new Date(b.date),
            y: b.balance
        });
    }
    return data;
}

function createInventoryGraph(dataPoints) {
    function aggregateData(data) {
        const aggregatedData = {};
        data.forEach(item => {
            const date = new Date(item.date).toISOString().substring(0, 10); // Extract YYYY-MM-DD
            if (!aggregatedData[date]) {
                aggregatedData[date] = { sum: 0, count: 0 };
            }
            aggregatedData[date].sum += item.value;
            aggregatedData[date].count += 1;
        });

        // Convert to array and calculate average
        return Object.keys(aggregatedData).map(date => {
            const avg = aggregatedData[date].sum / aggregatedData[date].count;
            return { date: new Date(date), value: avg };
        });
    }

    const processedData = aggregateData(dataPoints);

    // Extract dates and values for the chart
    const labels = processedData.map(d => d.date.toISOString().substring(0, 10));
    const values = processedData.map(d => d.value);

    // Prepare the data object for Chart.js
    const data = {
        labels: labels,
        datasets: [{
            label: 'Total value',
            backgroundColor: "#00c74d",
            borderColor: "#00c74d",
            fill: false,
            data: values,
            lineTension: 0.1
        }]
    };

    const c = {
        type: 'line',
        data: data,
        scaleFontColor: "#FFFFFF",
        options: {
            elements: {
                point: {
                    radius: 3
                }
            },
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    distribution: 'linear',
                    time: {
                        // Luxon format string
                        tooltipFormat: 'dd.MM.yy HH:mm:ss'
                    },
                    title: {
                        display: true,
                        text: 'Date'
                    },
                    grace: '10%',
                    grid: {
                        display: false,
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        autoSkipPadding: 10,
                        color: 'rgba(255, 255, 255, 0.7)',
                        // Include a dollar sign in the ticks
                        callback: function(value, index, ticks) {
                            const formattedDate = new Date(value).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: '2-digit'
                            }).replace(/\//g, '.');
                            return formattedDate;
                        }
                    },
                    title: {
                        display: false // Remove x-axis title
                    }
                },
                y: {
                    grace: '10%',
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        // Include a dollar sign in the ticks
                        callback: function(value, index, ticks) {
                            function round1Decimal(number) {
                                return (Math.round(number * 10) / 10).toFixed(1)
                            }
                            let label = "";

                            if(value > 99500){
                                return Math.abs(value / 1000) + "k";
                            }

                            if(value > 1000) {
                                return  round1Decimal(value / 1000) + "k";
                            }
                            
                            return value;
                        }
                    }
                }
            },
        },
    };

    const ctx = document.getElementById('inventory-chart');

    inventoryChart = new Chart(ctx, c);
}

function createBalanceGraph(balance) {

    let datapoints = createDataFromBalance(balance);

    const data = {
        labels: [],
        datasets: [{
            label: 'Balance',
            backgroundColor: "#00c74d",
            borderColor: "#00c74d",
            fill: false,
            data: datapoints,
            lineTension: 0.1
        }]
    };

    const config = {
        type: 'line',
        data: data,
        scaleFontColor: "#FFFFFF",
        options: {
            elements: {
                point: {
                    radius: 3
                }
            },
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: false,
                    type: 'time',
                    distribution: 'linear',
                    time: {
                        // Luxon format string
                        tooltipFormat: 'dd.MM.yy HH:mm:ss'
                    },
                    title: {
                        display: true,
                        text: 'Date'
                    },
                    ticks: {
                        display: false //this will remove only the label
                    },
                    grace: '10%',
                    grid: {
                        display: false,
                    },
                    border: {
                        display: false,
                    }
                },
                y: {
                    display: false,
                    grace: '10%',
                    grid: {
                        display: false,
                    },
                    border: {
                        display: false,
                    }
                }
            },
        },
    };


    const ctx = document.getElementById('balance-chart');

    balanceChart = new Chart(ctx, config);
}

function datediff(first, second) {
    return Math.round((second - first) / (1000 * 60 * 60 * 24));
}

function createTradeHistoryElement(trade, withdraw) {
    let hasStickers = trade.tradeItems[0].stickers != null && trade.tradeItems[0].stickers.length > 0;

    let dateDiff = -1;
    if (withdraw != null) {
        dateDiff = datediff(new Date(withdraw.updatedAt), new Date(trade.updatedAt)) - 8;
    }

    return `<div class='trade-history-element ${hasStickers ? 'sticker-trade' : ''} ${trade.depositor.id == config.roll_user_id ? 'trade-deposit' : 'trade-withdraw'}'>
                <div class='trade-data-title'>
                    <div title='${trade.tradeItems[0].marketName}' class='trade-item-name'>${trade.tradeItems[0].marketName}</div>
                    <div class='trade-timestamp update-date-timestamp' data-date='${trade.updatedAt}' title='${new Intl.DateTimeFormat('en-US', dateOptions).format(new Date(trade.updatedAt))}'>${timeDifference(new Date, new Date(trade.updatedAt))}</div>
                </div>
                <div class='trade-body-wrapper'>
                    <!--${hasStickers ?
            `<div class='trade-item-stickers'>
                            <div class='trade-sticker-wrapper'>
                                ${createStickerElements(trade.tradeItems[0].stickers)}
                            </div>

                        </div>`
            : ''}-->
                    <div class='trade-item-icon-wrapper'>
                        <div class='trade-item-icon'>
                            <img src='${trade.tradeItems[0].itemVariant.iconUrl != "NULL" ? trade.tradeItems[0].itemVariant.iconUrl : placeholderSkinImage}'>
                        </div>
                    </div>
                    <!--${trade.avgPaintWear != null ?
            `<div class='trade-float-wrapper'>
                        ${createFloatSlider(trade.avgPaintWear)}
                    </div>`
            :
            `<div class='dummy-float-wrapper'>
                        <div class='dummy-float-border'></div>
                    </div>`
        }-->
                    <div class='trade-data'>
                        <div class="trade-data-table">
                            ${withdraw != null ? `
                            <div class="trade-data-row">
                                <div class="trade-data-column trade-title-column">
                                    Buy Price: 
                                </div>
                                <div class="trade-data-column trade-value-column">
                                    ${withdraw.totalValue}
                                </div>
                                
                            </div>` : ""}
                            <div class="trade-data-row">
                                <div class="trade-data-column trade-title-column">
                                    Sell Price: 
                                </div>
                                <div class="trade-data-column trade-value-column">
                                    ${trade.totalValue}
                                </div>
                                
                            </div>
                        </div>

                        <div class="trade-data-table">
                            ${dateDiff > -1 ? `
                            <div class="trade-data-row">
                                <div class="trade-data-column trade-title-column">
                                    Hold time: 
                                </div>
                                <div class="trade-data-column trade-value-column">
                                    ${dateDiff >= 0 ? dateDiff : 0} ${dateDiff == 1 ? 'day' : 'days'}
                                </div>
                            </div>` : ""}
                            <div class="trade-data-row">
                                ${hasStickers ? `
                                <div class="trade-data-column trade-title-column">
                                    Stickers: 
                                </div>
                                <div class="trade-data-column trade-value-column">
                                    ${getStickerPrice(trade)}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        ${withdraw != null ? `
                        <div class="trade-data-table percent-table">
                            <div class="trade-data-row">
                                <div class="trade-data-row ${trade.totalValue - withdraw.totalValue >= 0 ? "green-text" : "red-text"}">
                                     ${round2Decimals(trade.totalValue - withdraw.totalValue)}
                                </div>
                                <div class="trade-data-row">
                                    ${round2Decimals(((100 / withdraw.totalValue) * trade.totalValue) - 100)}%
                                </div>
                            </div>
                        </div>
                        `: ''
        }
                    </div>
                </div>
            </div>`;
}

function updateBalanceText(balance) {
    $("#balance-text").html(round2Decimals(balance));
}

function updateSinceTimestamp(trade) {
    if (trade == null) {
        $("#time-first-trade").html("-");
        return;
    }

    hasFirstTrade = true;

    $("#time-first-trade").html(timeDifference(new Date(), new Date(trade.updatedAt)));

    $("#time-first-trade").attr("data-date", trade.updatedAt);
    $("#time-first-trade").addClass("update-date-timestamp");
}

function round2Decimals(number) {
    return (Math.round(number * 100) / 100).toFixed(2)
}


kniveTypes = ["knife","karambit","bayonet","daggers"];

const isKnife = (marketName) => {
    marketName = marketName.toLowerCase()
    if (kniveTypes.some((knifeType) => marketName.includes(knifeType))){
        return true;
    }
    return false;
}

function isDoppler (marketName) {
    return (marketName.includes('Doppler') || marketName.includes('Emerald') ||
        marketName.includes('Ruby') || marketName.includes('Black Pearl') ||
        marketName.includes('Sapphire')) && isKnife(marketName) ? true : false;
}

function getPhaseName(marketName) {
    let phaseName = refactorDopplerName(marketName)[1];

    phaseName = phaseName.replace("Phase", "P").replace("Emerald", "E").replace("Sapphire", "S").replace("Ruby", "R").replace("Black Pearl", "BP").replace(" ", "");
    return phaseName;
}

function refactorDopplerName (marketName) {
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

function updateStatsText() {
    let sold = 0;
    let bought = 0;

    let soldTotal = 0;
    let boughtTotal = 0;

    let weightedSold = 0;
    let weightedBought = 0;
    let weightedSoldTotal = 0;
    let weightedBoughtTotal = 0;

    for (let t of allTrades) {

        if (t.depositor == null) continue;

        if (t.depositor.id == config.roll_user_id) {
            sold++;
            if (t.markupPercent != null) {
                weightedSold += t.totalValue * t.markupPercent;
                weightedSoldTotal += t.totalValue;
            }
            soldTotal += t.totalValue;
        } else {
            bought++;
            if (t.markupPercent != null) {
                weightedBought += t.totalValue * t.markupPercent;
                weightedBoughtTotal += t.totalValue;
            }
            boughtTotal += t.totalValue;
        }
    }

    weightedSold = round2Decimals(weightedSold / weightedSoldTotal);
    weightedBought = round2Decimals(weightedBought / weightedBoughtTotal);

    let netDiff = weightedSold - weightedBought;

    let profit = round2Decimals(soldTotal * netDiff / 100);

    $("#items-sold").html(sold);
    $("#items-bought").html(bought);

    $("#items-sold-markup").html(weightedSold + "%");
    $("#items-bought-markup").html(weightedBought + "%");

    $("#items-sold-total").html((Math.round(soldTotal * 100) / 100).toFixed(2));
    $("#items-bought-total").html((Math.round(boughtTotal * 100) / 100).toFixed(2));

    //$("#estimated-profit").html(profit);

    if (depositWithdrawChart == null) {
        setupWithdrawDepositPie(sold, bought);
        setupWithdrawDepositTotalPie(soldTotal, boughtTotal);
    } else {
        updateWithdrawDepositPie(sold, bought);
        updateWithdrawDepositTotalPie(soldTotal, boughtTotal);
    }
}

function updateWithdrawDepositPie(sold, bought) {
    depositWithdrawChart.data.datasets.forEach((dataset) => {
        dataset.data = [sold, bought];
    });

    depositWithdrawChart.update();
}

function updateWithdrawDepositTotalPie(soldTotal, boughtTotal) {
    depositWithdrawTotalChart.data.datasets.forEach((dataset) => {
        dataset.data = [soldTotal, boughtTotal];
    });

    depositWithdrawTotalChart.update();
}

function setupWithdrawDepositPie(sold, bought) {
    const data = {
        labels: [
            'Sold',
            'Bought',
        ],
        datasets: [{
            label: 'Amount',
            data: [sold, bought],
            backgroundColor: [
                '#00c74d',
                '#262a30'
            ],
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.05)"
        }]
    };

    const config = {
        type: 'doughnut',
        data: data,
        options: {
            plugins: {
                legend: {
                    align: "start",
                    position: "bottom",
                    labels: {
                        color: "rgba(255, 255, 255, .7)",
                        font: {
                            size: 13.6,
                        }
                    }
                }
            }
        }
    };

    const ctx = document.getElementById('deposit-withdraw-chart');

    depositWithdrawChart = new Chart(ctx, config);
}

function setupWithdrawDepositTotalPie(soldTotal, boughtTotal) {
    const data = {
        labels: [
            'Sold',
            'Bought',
        ],
        datasets: [{
            label: 'Price',
            data: [soldTotal, boughtTotal],
            backgroundColor: [
                '#00c74d',
                '#262a30'
            ],
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.05)"
        }]
    };

    const config = {
        type: 'doughnut',
        data: data,
        options: {
            plugins: {
                legend: {
                    align: "start",
                    position: "bottom",
                    labels: {
                        color: "rgba(255, 255, 255, .7)",
                        font: {
                            size: 13.6,
                        }
                    }
                }
            }
        }
    };

    const ctx = document.getElementById('deposit-withdraw-total-chart');

    depositWithdrawTotalChart = new Chart(ctx, config);
}

function arrayAvg(arr) {
    const sum = arr.reduce((a, b) => a + b, 0);
    const avg = (sum / arr.length) || 0;
    return avg;
}

function createDaytimeChartData() {
    let d = {}
    d.sold = Array(24).fill(0);
    d.bought = Array(24).fill(0);

    for (let trade of allTrades) {
        if (trade.depositor == null) continue;

        let date = new Date(trade.updatedAt);
        let hour = date.getHours();
        if (trade.depositor.id == config.roll_user_id) {
            d.sold[hour]++;
        } else {
            d.bought[hour]++;
        }
    }

    return d;
}

function updateDaytimeChart() {

    let d = createDaytimeChartData();
    daytimeChart.data.datasets[0].data = d.sold;
    daytimeChart.data.datasets[1].data = d.bought;

    daytimeChart.update();
}

function createDaytimeChart() {
    let d = createDaytimeChartData();

    const data = {
        labels: ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
            "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
            "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
            "19:00", "20:00", "21:00", "22:00", "23:00"],
        datasets: [
            {
                label: 'Sold',
                data: d.sold,
                backgroundColor: [
                    '#00c74d'
                ],
                borderColor: [
                    'rgba(255, 255, 255, 0.05)'
                ],
                borderWidth: 1
            },
            {
                label: 'Bought',
                data: d.bought,
                backgroundColor: [
                    '#262a30'
                ],
                borderColor: [
                    'rgba(255, 255, 255, 0.05)'
                ],
                borderWidth: 1
            }
        ]
    };

    const config = {
        type: 'bar',
        data: data,
        options: {
            maintainAspectRatio: false,
            scales: {
                y: {
                    grid: {
                        display: false,
                    },
                    stacked: true
                },
                x: {
                    grid: {
                        display: false,
                    },
                    stacked: true
                }
            }
        },
    };

    const ctx = document.getElementById('daytime-chart');

    daytimeChart = new Chart(ctx, config);
}

function loadHistory() {
    $.ajax({
        url: cfgUrl + "/get-data",
        type: "GET",
        crossDomain: true,
    }).done(function (data) {
        let balanceHistory = data.balance;
        createBalanceGraph(balanceHistory);

        let balance = balanceHistory.length > 0 ? balanceHistory.slice(-1)[0].balance : 0;
        updateBalanceText(balance);

        updateSinceTimestamp(data.history[data.history.length - 1]);

        let index = 0;

        for (trade of data.history) {
            if (trade.depositor != null && trade.depositor.id != config.roll_user_id) {
                if (trade.avgPaintWear != null) {
                    allWithdraws[trade.tradeItems[0].marketName + "|" + trade.avgPaintWear] = trade;
                } else if (trade.tradeItems[0].steamExternalAsset?.steamInspectItem?.paintWear != null) {
                    allWithdraws[trade.tradeItems[0].marketName + "|" + trade.tradeItems[0].steamExternalAsset?.steamInspectItem?.paintWear] = trade;
                } else {
                    allWithdraws[trade.tradeItems[0].marketName + "|" + 0] = trade;
                }
            }

            index += 1;

            if((trade.depositor != null || trade.withdrawer != null) && index < 10) {
                let isDeposit = trade.depositor.id == config.roll_user_id;

                if ($("#live-trade-dummy-item").length > 0) {
                    $("#live-trade-dummy-item").remove();
                }

                $("#live-trades").append(
                    `<div class="live-trade-item ${isDeposit ? "live-trade-deposit" : "live-trade-withdraw"} completed" data-tradeId="">
                        <div class="live-trade-header" title="${trade.tradeItems[0].marketName}">${trade.tradeItems[0].marketName}</div>
                        <div class="live-trade-detail-wrapper">
                            <div class='trade-data-table'>
                                <div class='trade-data-column'>Status:</div><div class="trade-data-column live-trade-status green-text">Completed</div>
                            </div>
                            ${createTradeDataTable(trade)}
                            <div class="live-trade-progress-bar">
                                <div class="progress"></div>
                            </div>
                        </div>
                    </div>`
                );
            }

            allTrades.push(trade);
        }

        let i = 0;

        for (let t of allTrades) {
            if (t.depositor == null) {
                continue;
            }

            if (t.depositor.id == config.roll_user_id) {
                let w;

                if (t.avgPaintWear != null) {
                    w = allWithdraws[t.tradeItems[0].marketName + "|" + t.avgPaintWear];
                } else if (t.tradeItems[0].steamExternalAsset?.steamInspectItem?.paintWear != null) {
                    w = allWithdraws[t.tradeItems[0].marketName + "|" + t.tradeItems[0].steamExternalAsset?.steamInspectItem?.paintWear];
                } else {
                    w = allWithdraws[t.tradeItems[0].marketName + "|" + 0];
                }

                $("#trade-history-list").append(createTradeHistoryElement(t, w));

                i++;
                if (i > 100) break;
            }
        }

        setInterval(function () {
            $(".update-date-timestamp").each(function () {
                $(this).html(timeDifference(new Date(), new Date($(this).attr("data-date"))));
            });
        }, 30 * 1000);

        createDaytimeChart();

        updateStatsText();
    });
}

async function loadInventory() {
    return new Promise((resolve) => {
        $.ajax({
            url: cfgUrl + "/get-inventory",
            type: "GET",
            crossDomain: true,
        }).done(function (data) {
            resolve(data);
        });
    });
}

function loadConfig() {
    if (configLoaded) return;
    configLoaded = true;
    $.ajax({
        url: cfgUrl + "/get-config-initial",
        type: "GET",
        crossDomain: true,
    }).done(function (data) {
        loadHistory();
        
        let inventoryHistory = data.inventory;
        createInventoryGraph(inventoryHistory);

        console.log("Loaded config from api", data);

        depositActive = data.config.deposit_active ?? false;
        withdrawActive = data.config.withdraw_active ?? false;

        depositToggled();
        withdrawToggled();

        //create blacklist elements
        let loadedBlacklist = data.blacklist ?? [];
        let loadedWhitelist = data.whitelist ?? [];

        for (let i = 0; i < loadedBlacklist.length; i++) {
            $("#blacklist-textarea").append(loadedBlacklist[i] + "\n");
        }

        let filterData = data.filters;

        //check category custom float checkboxes
        let generalHeader = $("#table-general");
        let stickerHeader = $("#table-sticker");
        let specificHeader = $("#table-specific");

        $(generalHeader).find(".use-custom-float").prop("checked", filterData.generalsUseCustomFloat);
        $(stickerHeader).find(".use-custom-float").prop("checked", filterData.stickerUseCustomFloat);
        $(specificHeader).find(".use-custom-float").prop("checked", filterData.specificUseCustomFloat);

        //load general filters
        for (let i = 0; i < filterData.general.length; i++) {
            let _filter = filterData.general[i];
            $("#general-filter-wrapper").append(createFilterElement(false, "", _filter.min, _filter.max, _filter.percent, _filter.blacklist, _filter.stat, _filter.souvenir, _filter.fn, _filter.mw, _filter.ft, _filter.ww, _filter.bs, false, false, false, false));
        }

        //load sticker filters
        for (let i = 0; i < filterData.stickers.length; i++) {
            let _filter = filterData.stickers[i];
            $("#sticker-filter-wrapper").append(createFilterElement(true, _filter.name, _filter.min, _filter.max, _filter.percent, _filter.blacklist, _filter.stat, _filter.souvenir, _filter.fn, _filter.mw, _filter.ft, _filter.ww, _filter.bs, true, false, true, _filter.buyScrapedCraft));
        }

        //load specific filters
        for (let i = 0; i < filterData.specific.length; i++) {
            let _filter = filterData.specific[i];
            $("#specific-filter-wrapper").append(createFilterElement(true, _filter.name, _filter.min, _filter.max, _filter.percent, _filter.blacklist, _filter.stat, _filter.souvenir, _filter.fn, _filter.mw, _filter.ft, _filter.ww, _filter.bs, true, false, false, false));
        }

        //load custom float parameters
        $("#float-slider-fn input.input-max").val(filterData.fnMax);
        $("#float-slider-fn input.input-min").val(filterData.fnMin);

        $("#float-slider-mw input.input-max").val(filterData.mwMax);
        $("#float-slider-mw input.input-min").val(filterData.mwMin);

        $("#float-slider-ft input.input-max").val(filterData.ftMax);
        $("#float-slider-ft input.input-min").val(filterData.ftMin);

        $("#float-slider-ww input.input-max").val(filterData.wwMax);
        $("#float-slider-ww input.input-min").val(filterData.wwMin);

        $("#float-slider-bs input.input-max").val(filterData.bsMax);
        $("#float-slider-bs input.input-min").val(filterData.bsMin);

        //trigger input to update UI
        $("#float-slider-fn input.input-max").trigger("input");

        //finally initialize the Variables according to the values we inserted
        filters = filterData;
        blacklist = loadedBlacklist;
        config = data.config;

        for (let item of loadedWhitelist) {
            whitelist.set(item, 1);
        }
    });
}

class Filter {
    constructor(name, min, max, percent, blacklist, stat, souvenir, fn, mw, ft, ww, bs, buyScrapedCraft) {
        this.name = name;
        this.min = min;
        this.max = max;
        this.percent = percent;
        this.blacklist = blacklist;
        this.stat = stat;
        this.souvenir = souvenir;
        this.fn = fn;
        this.mw = mw;
        this.ft = ft;
        this.ww = ww;
        this.bs = bs;
        this.buyScrapedCraft = buyScrapedCraft;
    }
}

function extractFilterFromDom(filterDom) {
    return new Filter(
        $(filterDom).find(".filter-name input").val(),
        $(filterDom).find(".filter-min input").val(),
        $(filterDom).find(".filter-max input").val(),
        $(filterDom).find(".filter-max-percent input").val(),
        $(filterDom).find(".filter-use-blacklist input").is(":checked"),
        $(filterDom).find(".filter-allow-stat-trak input").is(":checked"),
        $(filterDom).find(".filter-allow-souvenir input").is(":checked"),
        $(filterDom).find(".filter-input-wear .input-fn").hasClass("selected"),
        $(filterDom).find(".filter-input-wear .input-mw").hasClass("selected"),
        $(filterDom).find(".filter-input-wear .input-ft").hasClass("selected"),
        $(filterDom).find(".filter-input-wear .input-ww").hasClass("selected"),
        $(filterDom).find(".filter-input-wear .input-bs").hasClass("selected"),
        $(filterDom).find(".input-scraped-craft input").is(":checked")
    );
}

function createFilterElement(showName, name, min, max, percent, blacklist, stat, souvenir, fn, mw, ft, ww, bs, canRemove, isSpecific, isStickerFilter, allowScraped) {
    return "<div class='filter-wrapper'>"
        + (canRemove ? "<div class='remove-filter'><span class='material-icons'>delete</span></div>" : "")
        + (showName ? "<div class='filter-field-wrapper filter-name'><span>Name</span><input value='" + name + "'></div>" : "")
        + (!isSpecific ? "<div class='filter-field-wrapper filter-min'><span>Min</span><input type='number' value='" + min + "'></div>" : "")
        + (!isSpecific ? "<div class='filter-field-wrapper filter-max'><span>Max</span><input type='number' value='" + max + "'></div>" : "")
        + "<div class='filter-field-wrapper filter-max-percent'><span>Max%</span><input type='number' value='" + percent + "'></div>"
        + (!isSpecific ? ("<div class='filter-field-wrapper filter-use-blacklist checkbox-wrapper'><span>Blacklist</span><input type='checkbox' " + (blacklist ? "checked" : "") + "></div>") : "")
        + "<div class='filter-field-wrapper filter-allow-stat-trak checkbox-wrapper'><span>StatTrak</span><input type='checkbox' " + (stat ? "checked" : "") + "></div>"
        + "<div class='filter-field-wrapper filter-allow-souvenir checkbox-wrapper'><span>Souvenir</span><input type='checkbox' " + (souvenir ? "checked" : "") + "></div>"
        + (isStickerFilter ? ("<div class='filter-field-wrapper input-scraped-craft checkbox-wrapper'><span>Scraped</span><input type='checkbox' " + (allowScraped ? "checked" : "") + "></div>") : "")
        + "<div class='filter-input-wear'>"
        + "<div class='input-fn input-wear " + (fn ? "selected" : "") + "'><span>FN</span></div>"
        + "<div class='input-mw input-wear " + (mw ? "selected" : "") + "'><span>MW</span></div>"
        + "<div class='input-ft input-wear " + (ft ? "selected" : "") + "'><span>FT</span></div>"
        + "<div class='input-ww input-wear " + (ww ? "selected" : "") + "'><span>WW</span></div>"
        + "<div class='input-bs input-wear " + (bs ? "selected" : "") + "'><span>BS</span></div>"
        + "</div>"
        + "</div>";
}
