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
exports.DataBuilderFieldType = void 0;
/** Base for project field types. Missing/empty values are handled before conversion. */
const DataBuilderFieldType = class DataBuilderFieldType {
    constructor() {
        this.key = "string";
        this.type = "string";
    }
    isMissing(value) {
        return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    }
    missingValue(_context) {
        return null;
    }
    convert(value, _context) {
        return value;
    }
    validationValue(value, _context) {
        return value;
    }
    save(value, context) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.isMissing(value) ? this.missingValue(context) : this.convert(value, context);
        });
    }
    validate(value, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const required = typeof context.field.required === "function" ? yield context.field.required(context.data) : context.field.required;
            // Preserve v1 required semantics, including required checkboxes.
            if (required &&
                (this.isMissing(value) ||
                    value === false ||
                    (Array.isArray(value) && !value.length) ||
                    (!Array.isArray(value) && value != null && value.toString().trim() === ""))) {
                return "Dieses Feld muss ausgefüllt werden.";
            }
            return null;
        });
    }
};
exports.DataBuilderFieldType = DataBuilderFieldType;
