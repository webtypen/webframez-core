"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class DateFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "date";
        this.type = "date";
    }
}
exports.DateFieldType = DateFieldType;
