"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultFormFields = exports.unexpectedFormFields = exports.projectFormData = exports.formSchema = void 0;
const DataBuilderFieldPath_1 = require("./DataBuilderFieldPath");
const ModelForm_1 = require("./ModelForm");
/** Standard layout slots accept v1 descriptors; custom slots accept explicit ModelForm nodes. */
function formSchema(schema, definitions) {
    const selected = {};
    function bind(node) {
        var _a;
        (0, DataBuilderFieldPath_1.assertFieldName)(node.field);
        if (!Object.prototype.hasOwnProperty.call(schema, node.field))
            throw new Error("Unknown form field: " + node.field);
        const source = schema[node.field];
        const field = Object.assign({}, source);
        if (Array.isArray(node.fields) && source.schema)
            field.schema = formSchema(source.schema, node.fields);
        if (((_a = selected[node.field]) === null || _a === void 0 ? void 0 : _a.schema) && field.schema)
            field.schema = Object.assign(Object.assign({}, selected[node.field].schema), field.schema);
        selected[node.field] = field;
    }
    function customSlot(value) {
        if (!value || typeof value !== "object")
            return;
        const node = value;
        if (node[ModelForm_1.modelFormNode]) {
            visit(node);
            return;
        }
        // Component configuration may contain a property called field: it is never a binding by itself.
        for (const child of Object.values(node))
            customSlot(child);
    }
    function visit(node) {
        if (!node || typeof node !== "object")
            return;
        if (node[ModelForm_1.modelFormNode] === "field" || (!node.type && typeof node.field === "string")) {
            bind(node);
            return;
        }
        for (const child of Array.isArray(node.children) ? node.children : [])
            visit(child);
        for (const child of Array.isArray(node.fields) ? node.fields : [])
            visit(child);
        for (const tab of Array.isArray(node.tabs) ? node.tabs : []) {
            for (const child of Array.isArray(tab === null || tab === void 0 ? void 0 : tab.fields) ? tab.fields : [])
                visit(child);
        }
        for (const [key, value] of Object.entries(node)) {
            if (!["children", "fields", "tabs"].includes(key))
                customSlot(value);
        }
    }
    definitions.forEach(visit);
    return selected;
}
exports.formSchema = formSchema;
function projectFormData(schema, data) {
    if (data === null || data === undefined)
        return data;
    const result = {};
    for (const [key, field] of Object.entries(schema)) {
        if (!Object.prototype.hasOwnProperty.call(data, key))
            continue;
        const value = data[key];
        result[key] =
            field.schema && value != null
                ? field.type === "array" && Array.isArray(value)
                    ? value.map((item) => projectFormData(field.schema, item))
                    : field.type === "object"
                        ? projectFormData(field.schema, value)
                        : value
                : value;
    }
    return result;
}
exports.projectFormData = projectFormData;
function unexpectedFormFields(schema, data, errors, path = "", primaryKey) {
    if (!data || typeof data !== "object" || Array.isArray(data))
        return;
    for (const key of Object.keys(data)) {
        const name = path ? path + "." + key : key;
        if (!path && key === primaryKey)
            continue;
        if (!Object.prototype.hasOwnProperty.call(schema, key)) {
            Object.defineProperty(errors, name, {
                value: "Dieses Feld gehört nicht zu diesem Formular.",
                enumerable: true,
                configurable: true,
                writable: true,
            });
            continue;
        }
        const field = schema[key];
        if (field.schema && field.type === "array" && Array.isArray(data[key])) {
            data[key].forEach((item, i) => unexpectedFormFields(field.schema, item, errors, name + "[" + i + "]"));
        }
        else if (field.schema && field.type === "object")
            unexpectedFormFields(field.schema, data[key], errors, name);
    }
}
exports.unexpectedFormFields = unexpectedFormFields;
/** Supply child layouts for automatically generated forms using the v1 fields property. */
function defaultFormFields(schema) {
    return Object.entries(schema).map(([field, definition]) => (Object.assign({ field }, (definition.schema && ["array", "object"].includes(definition.type) ? { fields: defaultFormFields(definition.schema) } : {}))));
}
exports.defaultFormFields = defaultFormFields;
