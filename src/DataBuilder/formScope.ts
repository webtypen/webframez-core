import { assertFieldName } from "./DataBuilderFieldPath";
import { modelFormNode } from "./ModelForm";
import type { DataBuilderFields, DataBuilderFormDefinition, DataBuilderErrors } from "./DataBuilderTypes";

/** Standard layout slots accept v1 descriptors; custom slots accept explicit ModelForm nodes. */
export function formSchema(schema: DataBuilderFields, definitions: DataBuilderFormDefinition[]): DataBuilderFields {
    const selected: DataBuilderFields = {};

    function bind(node: any) {
        assertFieldName(node.field);
        if (!Object.prototype.hasOwnProperty.call(schema, node.field)) throw new Error("Unknown form field: " + node.field);
        const source = schema[node.field];
        const field = { ...source };
        if (Array.isArray(node.fields) && source.schema) field.schema = formSchema(source.schema, node.fields);
        if (selected[node.field]?.schema && field.schema) field.schema = { ...selected[node.field].schema, ...field.schema };
        selected[node.field] = field;
    }

    function customSlot(value: unknown) {
        if (!value || typeof value !== "object") return;
        const node = value as Record<string | symbol, any>;
        if (node[modelFormNode]) {
            visit(node);
            return;
        }
        // Component configuration may contain a property called field: it is never a binding by itself.
        for (const child of Object.values(node)) customSlot(child);
    }

    function visit(node: any) {
        if (!node || typeof node !== "object") return;
        if (node[modelFormNode] === "field" || (!node.type && typeof node.field === "string")) {
            bind(node);
            return;
        }
        for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
        for (const child of Array.isArray(node.fields) ? node.fields : []) visit(child);
        for (const tab of Array.isArray(node.tabs) ? node.tabs : []) {
            for (const child of Array.isArray(tab?.fields) ? tab.fields : []) visit(child);
        }
        for (const [key, value] of Object.entries(node)) {
            if (!["children", "fields", "tabs"].includes(key)) customSlot(value);
        }
    }

    definitions.forEach(visit);
    return selected;
}

export function projectFormData(schema: DataBuilderFields, data: any): any {
    if (data === null || data === undefined) return data;
    const result: any = {};
    for (const [key, field] of Object.entries<any>(schema)) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
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

export function unexpectedFormFields(schema: DataBuilderFields, data: any, errors: DataBuilderErrors, path = "", primaryKey?: string) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    for (const key of Object.keys(data)) {
        const name = path ? path + "." + key : key;
        if (!path && key === primaryKey) continue;
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
            data[key].forEach((item: any, i: number) => unexpectedFormFields(field.schema!, item, errors, name + "[" + i + "]"));
        } else if (field.schema && field.type === "object") unexpectedFormFields(field.schema, data[key], errors, name);
    }
}

/** Supply child layouts for automatically generated forms using the v1 fields property. */
export function defaultFormFields(schema: DataBuilderFields): DataBuilderFormDefinition[] {
    return Object.entries<any>(schema).map(([field, definition]) => ({
        field,
        ...(definition.schema && ["array", "object"].includes(definition.type) ? { fields: defaultFormFields(definition.schema) } : {}),
    }));
}
