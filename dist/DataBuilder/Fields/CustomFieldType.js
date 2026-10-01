"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class CustomFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "custom";
        this.type = "custom";
    }
}
exports.CustomFieldType = CustomFieldType;
