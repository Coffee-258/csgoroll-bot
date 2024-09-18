class TradeData {
    constructor(tradeId, itemName, totalValue, markupPercent, itemWear, itemWearName, stickers, rawData) {
        this.tradeId = tradeId;
        this.itemName = itemName;
        this.totalValue = totalValue;
        this.markupPercent = markupPercent;
        this.itemWear = itemWear;
        this.itemWearName = itemWearName;
        this.stickers = stickers;
        this.rawData = rawData;
    }
}

module.exports = {
    TradeData
};
