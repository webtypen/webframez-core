"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class OptionFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "option";
        this.type = "option";
    }
}
exports.OptionFieldType = OptionFieldType;
