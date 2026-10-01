"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class PasswordFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "password";
        this.type = "password";
    }
}
exports.PasswordFieldType = PasswordFieldType;
