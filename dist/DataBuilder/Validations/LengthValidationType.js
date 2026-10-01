"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LengthValidationType = void 0;
const DataBuilderValidationType_1 = require("../DataBuilderValidationType");
class LengthValidationType extends DataBuilderValidationType_1.DataBuilderValidationType {
    constructor() {
        super(...arguments);
        this.key = "length";
    }
    validate(value, parameters) {
        const [min, max] = parameters;
        if (!Number.isInteger(min) || min < 0 || (max !== undefined && (!Number.isInteger(max) || max < min)))
            throw new Error("length requires a minimum length and optional maximum length.");
        const size = this.length(value);
        return size >= min && (max === undefined || size <= max)
            ? null
            : `Die Länge muss mindestens ${min}${max === undefined ? "" : ` und höchstens ${max}`} betragen.`;
    }
}
exports.LengthValidationType = LengthValidationType;
