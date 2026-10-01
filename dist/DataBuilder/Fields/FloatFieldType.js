"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FloatFieldType = void 0;
const NumericFieldType_1 = require("./NumericFieldType");
class FloatFieldType extends NumericFieldType_1.NumericFieldType {
    constructor() {
        super(...arguments);
        this.key = "float";
        this.type = "float";
    }
    legacyValue(value) {
        return parseFloat(value.toString().replace(",", "."));
    }
}
exports.FloatFieldType = FloatFieldType;
