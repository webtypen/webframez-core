"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class ColorFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "color";
        this.type = "color";
    }
}
exports.ColorFieldType = ColorFieldType;
