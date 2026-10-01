"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validationArguments = exports.DataBuilderValidationType = void 0;
/** Return null on success or the v1 error text for this field. */
class DataBuilderValidationType {
    length(value) {
        return typeof value === "string" ? Array.from(value).length : Array.isArray(value) ? value.length : NaN;
    }
    size(value) {
        return typeof value === "number" ? value : this.length(value);
    }
}
exports.DataBuilderValidationType = DataBuilderValidationType;
function validationArguments(rule) {
    if (typeof rule === "string" && rule.length)
        return [rule, []];
    if (Array.isArray(rule) && typeof rule[0] === "string" && rule[0].length)
        return [rule[0], rule.slice(1)];
    throw new Error("Invalid DataBuilder validation rule.");
}
exports.validationArguments = validationArguments;
