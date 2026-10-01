"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelForms = exports.modelFields = exports.Forms = exports.Validates = exports.Field = void 0;
const DataBuilderFieldPath_1 = require("./DataBuilderFieldPath");
const fields = new WeakMap();
const forms = new WeakMap();
function ownField(target, property) {
    if (typeof property !== "string")
        throw new Error("DataBuilder fields require string property names");
    (0, DataBuilderFieldPath_1.assertFieldName)(property);
    const ctor = typeof target === "function" ? target : target.constructor;
    let metadata = fields.get(ctor);
    if (!metadata) {
        metadata = {};
        fields.set(ctor, metadata);
    }
    if (!Object.prototype.hasOwnProperty.call(metadata, property))
        metadata[property] = {};
    return metadata[property];
}
/** TypeScript declare types are erased: use type for non-string fields. */
function Field(options = {}) {
    return (target, property) => {
        const field = ownField(target, property);
        const validations = [...(field.validations || []), ...(options.validations || [])];
        Object.assign(field, options);
        if (validations.length)
            field.validations = validations;
    };
}
exports.Field = Field;
function Validates(...rules) {
    return (target, property) => {
        const field = ownField(target, property);
        field.validations = [...(field.validations || []), ...rules];
    };
}
exports.Validates = Validates;
function Forms(factory) {
    return (target) => {
        forms.set(target, factory);
    };
}
exports.Forms = Forms;
function modelFields(ctor) {
    var _a;
    const parent = Object.getPrototypeOf(ctor);
    const inherited = parent && parent !== Function.prototype ? modelFields(parent) : {};
    for (const [name, field] of Object.entries(fields.get(ctor) || {})) {
        inherited[name] = Object.assign(Object.assign(Object.assign({ type: "string" }, inherited[name]), field), { validations: [...(((_a = inherited[name]) === null || _a === void 0 ? void 0 : _a.validations) || []), ...(field.validations || [])] });
    }
    return inherited;
}
exports.modelFields = modelFields;
function modelForms(ctor) {
    const factory = forms.get(ctor);
    if (factory)
        return factory();
    if (Object.prototype.hasOwnProperty.call(ctor, "forms"))
        return typeof ctor.forms === "function" ? ctor.forms() : ctor.forms;
    const parent = Object.getPrototypeOf(ctor);
    return parent && parent !== Function.prototype ? modelForms(parent) : [];
}
exports.modelForms = modelForms;
