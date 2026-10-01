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
exports.ObjectFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class ObjectFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "object";
        this.type = "object";
    }
    missingValue(context) {
        return context.structured && context.field.schema ? this.convert({}, context) : null;
    }
    validate(value, context) {
        const _super = Object.create(null, {
            validate: { get: () => super.validate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const error = yield _super.validate.call(this, value, context);
            if (error)
                return error;
            return context.structured && !this.isMissing(value) && (typeof value !== "object" || Array.isArray(value))
                ? "Bitte ein Objekt angeben."
                : null;
        });
    }
    convert(value, context) {
        return __awaiter(this, void 0, void 0, function* () {
            if (context.structured && context.field.schema) {
                return context.applyChildren(context.field.schema, Object.assign({}, (context.currentValue || {})), context.path);
            }
            return value;
        });
    }
}
exports.ObjectFieldType = ObjectFieldType;
