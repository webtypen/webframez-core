"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectIdFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class ObjectIdFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "ObjectId";
        this.type = "ObjectId";
    }
    isMissing(value) {
        return value === undefined || value === null || value === "";
    }
    // v1 creates a new ID for an empty ObjectId field.
    missingValue(context) {
        return context.objectId();
    }
    convert(value, context) {
        return context.objectId(value);
    }
}
exports.ObjectIdFieldType = ObjectIdFieldType;
