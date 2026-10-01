"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.standardDataBuilderValidations = exports.MaxValidationType = exports.MinValidationType = exports.LengthValidationType = exports.EmailValidationType = void 0;
const EmailValidationType_1 = require("./EmailValidationType");
Object.defineProperty(exports, "EmailValidationType", { enumerable: true, get: function () { return EmailValidationType_1.EmailValidationType; } });
const LengthValidationType_1 = require("./LengthValidationType");
Object.defineProperty(exports, "LengthValidationType", { enumerable: true, get: function () { return LengthValidationType_1.LengthValidationType; } });
const MinValidationType_1 = require("./MinValidationType");
Object.defineProperty(exports, "MinValidationType", { enumerable: true, get: function () { return MinValidationType_1.MinValidationType; } });
const MaxValidationType_1 = require("./MaxValidationType");
Object.defineProperty(exports, "MaxValidationType", { enumerable: true, get: function () { return MaxValidationType_1.MaxValidationType; } });
function standardDataBuilderValidations() {
    return [new EmailValidationType_1.EmailValidationType(), new LengthValidationType_1.LengthValidationType(), new MinValidationType_1.MinValidationType(), new MaxValidationType_1.MaxValidationType()];
}
exports.standardDataBuilderValidations = standardDataBuilderValidations;
