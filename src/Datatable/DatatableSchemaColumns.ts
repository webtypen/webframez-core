/** Converts DataBuilder/DataSchema field definitions into an extensible column catalog. */
export class DatatableSchemaColumns {
    static fromSchema(schema: Record<string, any>, options: {
        prefix?: string;
        labelPrefix?: string;
        prepare?: (column: Record<string, any>, field: any, path: string) => Record<string, any> | null;
    } = {}): Record<string, any> {
        const columns: Record<string, any> = {};
        for (const [key, field] of Object.entries(schema || {})) {
            if (!field || /[.$]/.test(key) || ["__proto__", "constructor", "prototype"].includes(key)
                || field.secret || field.writeOnly || field.type === "password") continue;
            const mapping = options.prefix ? `${options.prefix}.${key}` : key;
            const label = [options.labelPrefix, field.label || key].filter(Boolean).join(" · ");
            if (field.type === "object") {
                Object.assign(columns, this.fromSchema(field.schema, { ...options, prefix: mapping, labelPrefix: label }));
                continue;
            }
            const types: Record<string, string> = { integer: "number", float: "number", number: "number", boolean: "boolean", date: "date", datetime: "datetime", option: "option", currency_cent: "currency", currency: "currency" };
            const column = {
                label, mapping, type: types[field.type] || "string", width: 170, hidden: true,
                sortable: !["array", "file", "filemanager_file", "relation"].includes(field.type) && !field.multi,
                ...(field.type === "currency" ? { plain: true } : {}),
                ...(field.options ? { options: field.options } : {}),
            };
            const prepared = options.prepare ? options.prepare(column, field, mapping) : column;
            if (prepared) columns[mapping] = prepared;
        }
        return columns;
    }
}
