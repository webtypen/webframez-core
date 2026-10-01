"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class SecureFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "secure";
        this.type = "secure";
    }
}
exports.SecureFieldType = SecureFieldType;
