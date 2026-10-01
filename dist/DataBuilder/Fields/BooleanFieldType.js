"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BooleanFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class BooleanFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "boolean";
        this.type = "boolean";
    }
}
exports.BooleanFieldType = BooleanFieldType;
