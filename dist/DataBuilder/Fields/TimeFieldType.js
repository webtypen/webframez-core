"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class TimeFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "time";
        this.type = "time";
    }
}
exports.TimeFieldType = TimeFieldType;
