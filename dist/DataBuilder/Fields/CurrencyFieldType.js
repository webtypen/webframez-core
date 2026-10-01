"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyFieldType = void 0;
const FloatFieldType_1 = require("./FloatFieldType");
class CurrencyFieldType extends FloatFieldType_1.FloatFieldType {
    constructor() {
        super(...arguments);
        this.key = "currency";
        this.type = "currency";
    }
}
exports.CurrencyFieldType = CurrencyFieldType;
