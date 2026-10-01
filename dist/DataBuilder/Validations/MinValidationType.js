"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinValidationType = void 0;
const DataBuilderValidationType_1 = require("../DataBuilderValidationType");
class MinValidationType extends DataBuilderValidationType_1.DataBuilderValidationType {
    constructor() {
        super(...arguments);
        this.key = "min";
    }
    validate(value, parameters) {
        const [min] = parameters;
        if (typeof min !== "number" || !Number.isFinite(min))
            throw new Error("min requires a finite number.");
        const size = this.size(value);
        return typeof size === "number" && Number.isFinite(size) && size >= min ? null : `Der Wert muss mindestens ${min} betragen.`;
    }
}
exports.MinValidationType = MinValidationType;
