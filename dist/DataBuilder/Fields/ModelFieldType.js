"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class ModelFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "model";
        this.type = "model";
    }
}
exports.ModelFieldType = ModelFieldType;
