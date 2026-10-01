"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailValidationType = void 0;
const DataBuilderValidationType_1 = require("../DataBuilderValidationType");
class EmailValidationType extends DataBuilderValidationType_1.DataBuilderValidationType {
    constructor() {
        super(...arguments);
        this.key = "email";
    }
    validate(value) {
        return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            ? null
            : "Bitte eine gültige E-Mail-Adresse eingeben.";
    }
}
exports.EmailValidationType = EmailValidationType;
