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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataBuilderFieldsProcessor = void 0;
const lodash_1 = __importDefault(require("lodash"));
const DBConnection_1 = require("../Database/DBConnection");
const DataBuilderFieldType_1 = require("./DataBuilderFieldType");
const LegacyFieldTypeAdapter_1 = require("./LegacyFieldTypeAdapter");
const DataBuilderValidationType_1 = require("./DataBuilderValidationType");
const Fields_1 = require("./Fields");
const Validations_1 = require("./Validations");
const DataBuilderFieldPath_1 = require("./DataBuilderFieldPath");
/** Field registry and recursive validation/conversion; no form selection or record persistence. */
class DataBuilderFieldsProcessor {
    constructor(connection, hooks) {
        this.connection = connection;
        this.fieldTypes = Object.create(null);
        this.standardFields = new Map((0, Fields_1.standardDataBuilderFields)().map((field) => [field.key, field]));
        this.validations = new Map((0, Validations_1.standardDataBuilderValidations)().map((rule) => [rule.key, rule]));
        this.hooks = hooks || this;
    }
    registerValidationType(rule) {
        const instance = typeof rule === "function" ? new rule() : rule;
        if (!instance.key || typeof instance.validate !== "function")
            throw new Error("Invalid DataBuilder validation type");
        this.validations.set(instance.key, instance);
        return this;
    }
    registerFieldType(key, options) {
        const definition = typeof key === "string" ? options || {} : typeof key === "function" ? new key() : key;
        const name = typeof key === "string" ? key : definition.key;
        if (!name)
            throw new Error("Missing DataBuilder field type key");
        this.fieldTypes[name] =
            definition instanceof DataBuilderFieldType_1.DataBuilderFieldType
                ? definition
                : Object.assign(Object.assign({}, definition), { key: name });
        return this;
    }
    /** The v1 lookup returns only explicitly registered object definitions. */
    getFieldType(key) {
        const field = this.fieldTypes[key];
        return field && !(field instanceof DataBuilderFieldType_1.DataBuilderFieldType) ? field : null;
    }
    /** Resolve a class instance, including adapters for v1 registrations and overrides. */
    getFieldTypeInstance(key) {
        const legacy = this.hooks.getFieldType(key);
        if (legacy)
            return new LegacyFieldTypeAdapter_1.LegacyFieldTypeAdapter(key, legacy, this.standardFields.get(key));
        const field = this.fieldTypes[key];
        return field instanceof DataBuilderFieldType_1.DataBuilderFieldType ? field : this.standardFields.get(key) || null;
    }
    processingType(key) {
        return this.getFieldTypeInstance(key) || this.standardFields.get("string");
    }
    getFieldTypesFrontend() {
        const fieldtypes = {};
        for (let key in this.fieldTypes) {
            fieldtypes[key] = {
                key: key,
                type: this.fieldTypes[key].type || "custom",
            };
        }
        return fieldtypes;
    }
    validateFields(db, type, fields, req, errors = {}, path, structured = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!errors) {
                errors = {};
            }
            if (!fields || typeof fields !== "object") {
                return errors;
            }
            for (let key in fields) {
                const fieldPath = (path ? path + "." : "") + key;
                const value = lodash_1.default.get(req.body.data, fieldPath);
                const fieldType = this.processingType(fields[key].type || "string");
                const context = this.validationContext(fields[key], fieldPath, req.body.data, req.body.payload, structured, req);
                const rules = (fields[key].validations || []).map((rule) => {
                    const [name, parameters] = (0, DataBuilderValidationType_1.validationArguments)(rule);
                    const validator = this.validations.get(name);
                    if (!validator)
                        throw new Error("Unknown DataBuilder validation: " + name);
                    return { validator, parameters };
                });
                const requiredError = yield fieldType.validate(value, context);
                if (requiredError) {
                    errors[fieldPath] = requiredError;
                    continue;
                }
                const validationValue = !fieldType.isMissing(value) && (rules.length || (structured && fields[key].unique))
                    ? yield fieldType.validationValue(value, context)
                    : value;
                if (rules.length && !fieldType.isMissing(value)) {
                    for (const { validator, parameters } of rules) {
                        const error = yield validator.validate(validationValue, parameters, context);
                        if (error) {
                            errors[fieldPath] = error;
                            break;
                        }
                    }
                }
                if (errors[fieldPath])
                    continue;
                // Check-Unique
                if (value !== null && value !== false && value !== undefined && fields[key].unique) {
                    let isUnique = false;
                    if (typeof fields[key].unique === "function") {
                        isUnique = yield fields[key].unique(req.body.data, req);
                    }
                    else if (typeof fields[key].unique === "object") {
                        isUnique = yield this.hooks.handleUnique(db, req, key, structured ? validationValue : value, fields[key], type);
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
                                errors = yield this.hooks.validateFields(db, type, fields[key].schema, req, errors, entryPath, structured);
                            }
                        }
                    }
                    else if (fields[key].type === "object") {
                        errors = yield this.hooks.validateFields(db, type, fields[key].schema, req, errors, fieldPath, structured);
                    }
                }
            }
            return errors;
        });
    }
    handleUnique(db, req, key, value, field, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const match = Object.assign({ [key]: value }, (typeof field.unique.match === "function"
                ? yield field.unique.match(req)
                : typeof field.unique.match === "object"
                    ? field.unique.match
                    : {}));
            const check = yield db
                .collection(typeof field.unique.collection === "string" && field.unique.collection.trim() !== ""
                ? field.unique.collection
                : type.schema.collection)
                .aggregate([
                { $match: match },
                ...(typeof field.unique.aggregation === "function"
                    ? yield field.aggregation(req)
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
        });
    }
    validationContext(field, path, data, payload, structured, request) {
        return { field, path, data, payload: Object.assign(Object.assign({}, payload), field.payload), structured, request };
    }
    applyFields(fields, element, data, payload, path, structured = false, request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof fields !== "object" || !fields)
                return element;
            for (const key of Object.keys(fields)) {
                (0, DataBuilderFieldPath_1.assertFieldName)(key);
                const field = fields[key];
                if (!field || field.unmapped)
                    continue;
                const fieldPath = (path ? path + "." : "") + key;
                const value = lodash_1.default.get(data, fieldPath);
                const fieldType = this.processingType(field.type || "string");
                const context = Object.assign(Object.assign({}, this.validationContext(field, fieldPath, data, payload, structured, request)), { currentValue: lodash_1.default.get(element, fieldPath), objectId: (value) => DBConnection_1.DBConnection.objectId(value, this.connection), applyChildren: (children, target, childPath) => __awaiter(this, void 0, void 0, function* () {
                        const root = {};
                        lodash_1.default.set(root, childPath, target);
                        yield this.hooks.applyFields(children, root, data, payload, childPath, structured, request);
                        return lodash_1.default.get(root, childPath);
                    }) });
                const converted = yield fieldType.save(value, context);
                lodash_1.default.set(element, fieldPath, converted);
            }
            return element;
        });
    }
    getField(req, type, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!path || path.trim() === "") {
                return null;
            }
            const schemaFields = typeof type.schema.fields === "function" ? yield type.schema.fields(req) : type.schema.fields;
            (0, DataBuilderFieldPath_1.assertFieldName)(path);
            const legacyField = lodash_1.default.get(schemaFields, this.hooks.removeArrayIndicators(path));
            if (legacyField && legacyField.type)
                return legacyField;
            // Object children use schema too, but have no array index in their request path.
            const segments = path.replace(/\[\d+\]/g, "").split(".");
            let fields = schemaFields;
            let field;
            for (const segment of segments) {
                if (!fields || !Object.prototype.hasOwnProperty.call(fields, segment))
                    return null;
                field = fields[segment];
                fields = field.schema;
            }
            return field && field.type ? field : null;
        });
    }
    removeArrayIndicators(str) {
        return str.replace(/\[\d+\]/g, ".schema");
    }
}
exports.DataBuilderFieldsProcessor = DataBuilderFieldsProcessor;
