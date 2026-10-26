"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatatableSchemaColumns = void 0;
/** Converts DataBuilder/DataSchema field definitions into an extensible column catalog. */
class DatatableSchemaColumns {
    static fromSchema(schema, options = {}) {
        const columns = {};
        for (const [key, field] of Object.entries(schema || {})) {
            if (!field || /[.$]/.test(key) || ["__proto__", "constructor", "prototype"].includes(key)
                || field.secret || field.writeOnly || field.type === "password")
                continue;
            const mapping = options.prefix ? `${options.prefix}.${key}` : key;
            const label = [options.labelPrefix, field.label || key].filter(Boolean).join(" · ");
            if (field.type === "object") {
                Object.assign(columns, this.fromSchema(field.schema, Object.assign(Object.assign({}, options), { prefix: mapping, labelPrefix: label })));
                continue;
            }
            const types = { integer: "number", float: "number", number: "number", boolean: "boolean", date: "date", datetime: "datetime", option: "option", currency_cent: "currency", currency: "currency" };
            const column = Object.assign(Object.assign({ label, mapping, type: types[field.type] || "string", width: 170, hidden: true, sortable: !["array", "file", "filemanager_file", "relation"].includes(field.type) && !field.multi }, (field.type === "currency" ? { plain: true } : {})), (field.options ? { options: field.options } : {}));
            const prepared = options.prepare ? options.prepare(column, field, mapping) : column;
            if (prepared)
                columns[mapping] = prepared;
        }
        return columns;
    }
}
exports.DatatableSchemaColumns = DatatableSchemaColumns;
