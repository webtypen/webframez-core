"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NumericFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
/** Shared decimal parsing for numeric fields. Legacy conversion remains explicit in each subtype. */
class NumericFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.error = "Bitte eine gültige Zahl angeben.";
    }
    parse(value) {
        if (typeof value === "number")
            return value;
        if (typeof value !== "string")
            return NaN;
        const decimal = value.trim().replace(",", ".");
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(decimal))
            return NaN;
        return Number(decimal);
    }
    accepts(value) {
        return Number.isFinite(value);
    }
    convert(value, context) {
        return (context === null || context === void 0 ? void 0 : context.structured) ? this.parse(value) : this.legacyValue(value);
    }
    validationValue(value, context) {
        return this.convert(value, context);
    }
    validate(value, context) {
        const _super = Object.create(null, {
            validate: { get: () => super.validate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const requiredError = yield _super.validate.call(this, value, context);
            if (requiredError)
                return requiredError;
            if (context.structured && !this.isMissing(value) && !this.accepts(this.parse(value)))
                return this.error;
            return null;
        });
    }
}
exports.NumericFieldType = NumericFieldType;
