"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaterangeFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class DaterangeFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "daterange";
        this.type = "daterange";
    }
}
exports.DaterangeFieldType = DaterangeFieldType;
