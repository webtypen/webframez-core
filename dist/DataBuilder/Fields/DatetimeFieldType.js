"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatetimeFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class DatetimeFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "datetime";
        this.type = "datetime";
    }
    convert(value) {
        if (typeof value !== "string")
            return null;
        const [datePart, timePart] = value.trim().split(" ");
        if (!datePart || !datePart.trim())
            return value;
        if (!datePart.includes("-") && datePart.match(/^\d{1,2}:\d{2}$/))
            return null;
        return datePart.trim() + " " + (timePart && timePart.includes(":") ? timePart.trim() : "00:00");
    }
}
exports.DatetimeFieldType = DatetimeFieldType;
