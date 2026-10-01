"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class StringFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "string";
        this.type = "string";
    }
}
exports.StringFieldType = StringFieldType;
