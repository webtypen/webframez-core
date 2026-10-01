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
exports.ArrayFieldType = void 0;
const DataBuilderFieldType_1 = require("../DataBuilderFieldType");
class ArrayFieldType extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor() {
        super(...arguments);
        this.key = "array";
        this.type = "array";
    }
    missingValue(context) {
        return context.structured || context.field.schema ? [] : null;
    }
    validate(value, context) {
        const _super = Object.create(null, {
            validate: { get: () => super.validate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const error = yield _super.validate.call(this, value, context);
            if (error)
                return error;
            if (context.structured && !this.isMissing(value)) {
                if (!Array.isArray(value))
                    return "Bitte eine Liste angeben.";
                if (context.field.schema && value.some((item) => !item || typeof item !== "object" || Array.isArray(item)))
                    return "Die Listeneinträge müssen Objekte sein.";
            }
            return null;
        });
    }
    convert(value, context) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!context.field.schema || typeof context.field.schema !== "object")
                return value;
            const result = [];
            for (let index = 0; index < ((value === null || value === void 0 ? void 0 : value.length) || 0); index++) {
                const target = context.structured && ((_a = context.currentValue) === null || _a === void 0 ? void 0 : _a[index]) && typeof context.currentValue[index] === "object"
                    ? Object.assign({}, context.currentValue[index]) : {};
                result.push(yield context.applyChildren(context.field.schema, target, `${context.path}[${index}]`));
            }
            return result;
        });
    }
}
exports.ArrayFieldType = ArrayFieldType;
