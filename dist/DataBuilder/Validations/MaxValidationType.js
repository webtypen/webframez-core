"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaxValidationType = void 0;
const DataBuilderValidationType_1 = require("../DataBuilderValidationType");
class MaxValidationType extends DataBuilderValidationType_1.DataBuilderValidationType {
    constructor() {
        super(...arguments);
        this.key = "max";
    }
    validate(value, parameters) {
        const [max] = parameters;
        if (typeof max !== "number" || !Number.isFinite(max))
            throw new Error("max requires a finite number.");
        const size = this.size(value);
        return typeof size === "number" && Number.isFinite(size) && size <= max ? null : `Der Wert darf höchstens ${max} betragen.`;
    }
}
exports.MaxValidationType = MaxValidationType;
