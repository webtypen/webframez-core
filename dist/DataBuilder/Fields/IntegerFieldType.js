"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegerFieldType = void 0;
const NumericFieldType_1 = require("./NumericFieldType");
class IntegerFieldType extends NumericFieldType_1.NumericFieldType {
    constructor() {
        super(...arguments);
        this.key = "integer";
        this.type = "integer";
        this.error = "Bitte eine ganze Zahl angeben.";
    }
    accepts(value) {
        return Number.isInteger(value);
    }
    legacyValue(value) {
        return parseInt(value);
    }
}
exports.IntegerFieldType = IntegerFieldType;
