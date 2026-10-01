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
exports.LegacyFieldTypeAdapter = void 0;
const DataBuilderFieldType_1 = require("./DataBuilderFieldType");
/** All v1 custom-field precedence rules live at this adapter boundary. */
class LegacyFieldTypeAdapter extends DataBuilderFieldType_1.DataBuilderFieldType {
    constructor(key, definition, standard) {
        super();
        this.definition = definition;
        this.standard = standard;
        this.key = key;
        this.type = definition.type || "custom";
        if (definition.onSave)
            this.onSave = definition.onSave.bind(definition);
        if (definition.onSearch)
            this.onSearch = definition.onSearch.bind(definition);
    }
    convert(value, context) {
        return this.onSave ? this.onSave(value, context.payload) : value;
    }
    validationValue(value, context) {
        return !this.onSave && this.standard ? this.standard.validationValue(value, context) : value;
    }
    save(value, context) {
        const _super = Object.create(null, {
            save: { get: () => super.save }
        });
        return __awaiter(this, void 0, void 0, function* () {
            // v1 always applies ObjectId conversion, even if a custom handler is registered.
            if (this.standard && (this.key === "ObjectId" || !this.onSave)) {
                return this.standard.save(value, context);
            }
            if (this.key === "array" && context.field.schema && this.standard) {
                const children = yield this.standard.convert(value, context);
                return this.convert(children, context);
            }
            return _super.save.call(this, value, context);
        });
    }
}
exports.LegacyFieldTypeAdapter = LegacyFieldTypeAdapter;
