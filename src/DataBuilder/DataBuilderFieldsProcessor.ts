import lodash from "lodash";
import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import { DBConnection } from "../Database/DBConnection";
import type { Request } from "../Router/Request";
import {
    DataBuilderFieldType,
    DataBuilderFieldTypeInstance,
    DataBuilderFieldContext,
    DataBuilderValidationContext,
} from "./DataBuilderFieldType";
import { LegacyFieldTypeAdapter } from "./LegacyFieldTypeAdapter";
import { DataBuilderValidationType, validationArguments } from "./DataBuilderValidationType";
import { standardDataBuilderFields } from "./Fields";
import { standardDataBuilderValidations } from "./Validations";
import { assertFieldName } from "./DataBuilderFieldPath";
import type { DataBuilderType, DataBuilderFields, DataBuilderFieldOptions, DataBuilderErrors } from "./DataBuilderTypes";

/** Calls back through the builder so v1 subclass overrides remain virtual, including recursion. */
export type DataBuilderFieldHooks = {
    getFieldType(key: string): DataBuilderFieldType | null;
    handleUnique(db: DocumentDatabase, req: Request, key: string, value: any, field: any, type: DataBuilderType): Promise<boolean>;
    validateFields(
        db: DocumentDatabase,
        type: DataBuilderType,
        fields: DataBuilderFields,
        req: Request,
        errors?: DataBuilderErrors,
        path?: string,
        structured?: boolean,
    ): Promise<DataBuilderErrors>;
    applyFields(
        fields: DataBuilderFields,
        element: any,
        data: any,
        payload: any,
        path?: string,
        structured?: boolean,
        request?: Request,
    ): Promise<any>;
    removeArrayIndicators(path: string): string;
};

/** Field registry and recursive validation/conversion; no form selection or record persistence. */
export class DataBuilderFieldsProcessor {
    private readonly hooks: DataBuilderFieldHooks;

    constructor(
        private readonly connection?: string,
        hooks?: DataBuilderFieldHooks,
    ) {
        this.hooks = hooks || this;
    }

    private fieldTypes: Record<string, DataBuilderFieldType | DataBuilderFieldTypeInstance> = Object.create(null);
    private standardFields = new Map<string, DataBuilderFieldTypeInstance>(standardDataBuilderFields().map((field) => [field.key, field]));
    private validations = new Map<string, DataBuilderValidationType>(standardDataBuilderValidations().map((rule) => [rule.key, rule]));

    registerValidationType(rule: DataBuilderValidationType | (new () => DataBuilderValidationType)) {
        const instance = typeof rule === "function" ? new rule() : rule;
        if (!instance.key || typeof instance.validate !== "function") throw new Error("Invalid DataBuilder validation type");
        this.validations.set(instance.key, instance);
        return this;
    }

    registerFieldType(
        key: string | DataBuilderFieldType | DataBuilderFieldTypeInstance | (new () => DataBuilderFieldTypeInstance),
        options?: any,
    ) {
        const definition = typeof key === "string" ? options || {} : typeof key === "function" ? new key() : key;
        const name = typeof key === "string" ? key : definition.key;
        if (!name) throw new Error("Missing DataBuilder field type key");
        this.fieldTypes[name] =
            definition instanceof DataBuilderFieldType
                ? definition
                : { ...definition, key: name };
        return this;
    }

    /** The v1 lookup returns only explicitly registered object definitions. */
    getFieldType(key: string): DataBuilderFieldType | null {
        const field = this.fieldTypes[key];
        return field && !(field instanceof DataBuilderFieldType) ? field : null;
    }

    /** Resolve a class instance, including adapters for v1 registrations and overrides. */
    getFieldTypeInstance(key: string): DataBuilderFieldTypeInstance | null {
        const legacy = this.hooks.getFieldType(key);
        if (legacy) return new LegacyFieldTypeAdapter(key, legacy, this.standardFields.get(key));
        const field = this.fieldTypes[key];
        return field instanceof DataBuilderFieldType ? field : this.standardFields.get(key) || null;
    }

    private processingType(key: string): DataBuilderFieldTypeInstance {
        return this.getFieldTypeInstance(key) || this.standardFields.get("string")!;
    }

    getFieldTypesFrontend() {
        const fieldtypes: any = {};
        for (let key in this.fieldTypes) {
            fieldtypes[key] = {
                key: key,
                type: this.fieldTypes[key].type || "custom",
            };
        }

        return fieldtypes;
    }

    async validateFields(
        db: DocumentDatabase,
        type: DataBuilderType,
        fields: DataBuilderFields,
        req: Request,
        errors: DataBuilderErrors = {},
        path?: string,
        structured = false,
    ): Promise<DataBuilderErrors> {
        if (!errors) {
            errors = {};
        }

        if (!fields || typeof fields !== "object") {
            return errors;
        }

        for (let key in fields) {
            const fieldPath = (path ? path + "." : "") + key;
            const value = lodash.get(req.body.data, fieldPath);

            const fieldType = this.processingType(fields[key].type || "string");
            const context = this.validationContext(fields[key], fieldPath, req.body.data, req.body.payload, structured, req);
            const rules = (fields[key].validations || []).map((rule: any) => {
                const [name, parameters] = validationArguments(rule);
                const validator = this.validations.get(name);
                if (!validator) throw new Error("Unknown DataBuilder validation: " + name);
                return { validator, parameters };
            });
            const requiredError = await fieldType.validate(value, context);
            if (requiredError) {
                errors[fieldPath] = requiredError;
                continue;
            }
            const validationValue =
                !fieldType.isMissing(value) && (rules.length || (structured && fields[key].unique))
                    ? await fieldType.validationValue(value, context)
                    : value;
            if (rules.length && !fieldType.isMissing(value)) {
                for (const { validator, parameters } of rules) {
                    const error = await validator.validate(validationValue, parameters, context);
                    if (error) {
                        errors[fieldPath] = error;
                        break;
                    }
                }
            }

            if (errors[fieldPath]) continue;

            // Check-Unique
            if (value !== null && value !== false && value !== undefined && fields[key].unique) {
                let isUnique = false;
                if (typeof fields[key].unique === "function") {
                    isUnique = await fields[key].unique(req.body.data, req);
                } else if (typeof fields[key].unique === "object") {
                    isUnique = await this.hooks.handleUnique(db, req, key, structured ? validationValue : value, fields[key], type);
                }

                if (!isUnique) {
                    errors[fieldPath] = "Es gibt bereits einen anderen Datensatz mit diesem Wert.";
                    continue;
                }
            }

            if (typeof fields[key].schema === "object") {
                if (fields[key].type === "array") {
                    if (value && value.length > 0) {
                        for (let i in value) {
                            const entryPath = fieldPath + "[" + i + "]";
                            errors = await this.hooks.validateFields(db, type, fields[key].schema!, req, errors, entryPath, structured);
                        }
                    }
                } else if (fields[key].type === "object") {
                    errors = await this.hooks.validateFields(db, type, fields[key].schema!, req, errors, fieldPath, structured);
                }
            }
        }

        return errors;
    }

    async handleUnique(db: DocumentDatabase, req: any, key: string, value: any, field: any, type: any) {
        const match: any = {
            [key]: value,
            ...(typeof field.unique.match === "function"
                ? await field.unique.match(req)
                : typeof field.unique.match === "object"
                  ? field.unique.match
                  : {}),
        };
        const check = await db
            .collection(
                typeof field.unique.collection === "string" && field.unique.collection.trim() !== ""
                    ? field.unique.collection
                    : type.schema.collection,
            )
            .aggregate([
                { $match: match },
                ...(typeof field.unique.aggregation === "function"
                    ? await field.aggregation(req)
                    : field.aggregation && Array.isArray(field.aggregation)
                      ? field.aggregation
                      : []),
            ])
            .toArray();

        if (!check || check.length < 1) {
            return true;
        }

        if (!req.body.__builder_id || req.body.__builder_id === "new") {
            return false;
        }

        for (let el of check) {
            if (el && el._id && el._id.toString() !== req.body.__builder_id) {
                return false;
            }
        }
        return true;
    }

    private validationContext(
        field: DataBuilderFieldOptions,
        path: string,
        data: any,
        payload: any,
        structured: boolean,
        request?: Request,
    ): DataBuilderValidationContext {
        return { field, path, data, payload: { ...payload, ...field.payload }, structured, request };
    }

    async applyFields(
        fields: DataBuilderFields,
        element: any,
        data: any,
        payload: any,
        path?: string,
        structured = false,
        request?: Request,
    ): Promise<any> {
        if (typeof fields !== "object" || !fields) return element;
        for (const key of Object.keys(fields)) {
            assertFieldName(key);
            const field = fields[key];
            if (!field || field.unmapped) continue;
            const fieldPath = (path ? path + "." : "") + key;
            const value = lodash.get(data, fieldPath);
            const fieldType = this.processingType(field.type || "string");
            const context: DataBuilderFieldContext = {
                ...this.validationContext(field, fieldPath, data, payload, structured, request),
                currentValue: lodash.get(element, fieldPath),
                objectId: (value) => DBConnection.objectId(value, this.connection),
                applyChildren: async (children, target, childPath) => {
                    const root: any = {};
                    lodash.set(root, childPath, target);
                    await this.hooks.applyFields(children, root, data, payload, childPath, structured, request);
                    return lodash.get(root, childPath);
                },
            };
            const converted = await fieldType.save(value, context);
            lodash.set(element, fieldPath, converted);
        }
        return element;
    }

    async getField(req: Request, type: DataBuilderType, path: string) {
        if (!path || path.trim() === "") {
            return null;
        }

        const schemaFields = typeof type.schema.fields === "function" ? await type.schema.fields(req) : type.schema.fields;
        assertFieldName(path);
        const legacyField = lodash.get(schemaFields, this.hooks.removeArrayIndicators(path));
        if (legacyField && legacyField.type) return legacyField;
        // Object children use schema too, but have no array index in their request path.
        const segments = path.replace(/\[\d+\]/g, "").split(".");
        let fields = schemaFields;
        let field: any;
        for (const segment of segments) {
            if (!fields || !Object.prototype.hasOwnProperty.call(fields, segment)) return null;
            field = fields[segment];
            fields = field.schema;
        }
        return field && field.type ? field : null;
    }

    removeArrayIndicators(str: string) {
        return str.replace(/\[\d+\]/g, ".schema");
    }
}
