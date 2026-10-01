"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WysiwygFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class WysiwygFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "wysiwyg";
        this.type = "wysiwyg";
    }
}
exports.WysiwygFieldType = WysiwygFieldType;
