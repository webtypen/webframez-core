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
exports.DataBuilder = void 0;
const lodash_1 = __importDefault(require("lodash"));
const Model_1 = require("../Database/Model");
class DataBuilder {
    constructor() {
        this.types = {};
        this.fieldTypes = {};
    }
    getType(key) {
        return this.types[key] && this.types[key].key ? this.types[key] : null;
    }
    registerType(typeObj) {
        this.types[typeObj.key] = typeObj;
        return this;
    }
    registerFieldType(key, options) {
        this.fieldTypes[key] = Object.assign(Object.assign({}, options), { key: key });
        return this;
    }
    registerModelType(key, model) {
        if (model &&
            typeof model.__schema === "object" &&
            model.__schema.fields &&
            (Object.keys(model.__schema.fields).length > 0 || typeof model.__schema.fields === "function")) {
            this.registerType({
                key: key,
                singular: model.__singular,
                plural: model.__plural,
                schema: Object.assign(Object.assign({}, model.__schema), { collection: key }),
                forms: model.__forms,
            });
        }
        return this;
    }
    getFieldType(key) {
        return this.fieldTypes[key] && this.fieldTypes[key].key ? this.fieldTypes[key] : null;
    }
    getFieldTypesFrontend() {
        const fieldtypes = {};
        for (let key in this.fieldTypes) {
            fieldtypes[key] = {
                key: key,
                type: this.fieldTypes[key].type,
            };
        }
        return fieldtypes;
    }
    getFieldsFrontend(fields, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const out = {};
            for (let key in fields) {
                if (false && fields[key].type === "object") {
                    // out[key] =
                    //     typeof fields[key].schema === "object" && Object.keys(fields[key].schema).length > 0
                    //         ? { ...(await this.getFieldsFrontend(fields[key].schema, payload)) }
                    //         : fields[key];
                }
                else {
                    out[key] =
                        typeof fields[key].schema === "object" && Object.keys(fields[key].schema).length > 0
                            ? Object.assign(Object.assign({}, fields[key]), { schema: yield this.getFieldsFrontend(fields[key].schema, payload) }) : fields[key];
                }
                if (out[key].type === "option" && typeof fields[key].options === "function") {
                    out[key].options = yield fields[key].options(payload);
                }
                if (out[key].disabled && typeof out[key].disabled === "function") {
                    out[key].disabled = yield out[key].disabled(payload);
                }
            }
            return out;
        });
    }
    getTypeFromRequest(req) {
        const type = req.body && req.body.__builder_type
            ? this.getType(req.body.__builder_type)
            : req.__builder_type
                ? this.getType(req.__builder_type)
                : null;
        if (!type) {
            throw new Error("Missing builder-type '" + (req.body && req.body.__builder_type ? req.body.__builder_type : req.__builder_type) + "' ...");
        }
        return type;
    }
    validateFields(db, type, fields, req, errors, path) {
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
                // Check-Required
                if (fields[key].required) {
                    let check = true;
                    if (typeof fields[key].required === "function") {
                        check = yield fields[key].required(req.body.data);
                    }
                    if (check) {
                        if (value === null ||
                            value === false ||
                            value === undefined ||
                            (Array.isArray(value) && value.length < 1) ||
                            (!Array.isArray(value) && value.toString().trim() === "")) {
                            errors[fieldPath] = "Dieses Feld muss ausgefüllt werden.";
                            continue;
                        }
                    }
                }
                // Check-Unique
                if (value !== null && value !== false && value !== undefined && fields[key].unique) {
                    let isUnique = false;
                    if (typeof fields[key].unique === "function") {
                        isUnique = yield fields[key].unique(req.body.data, req);
                    }
                    else if (typeof fields[key].unique === "object") {
                        isUnique = yield this.handleUnique(db, req, key, value, fields[key], type);
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
                                errors = yield this.validateFields(db, type, fields[key].schema, req, errors, entryPath);
                            }
                        }
                    }
                    else if (fields[key].type === "object") {
                        errors = yield this.validateFields(db, type, fields[key].schema, req, errors, fieldPath);
                    }
                }
                if (fields[key].validation && fields[key].validation.trim() !== "") {
                    // @ToDo
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
    typeForFrontend(type, req) {
        return __awaiter(this, void 0, void 0, function* () {
            const newData = {};
            for (let key in type) {
                if (key === "forms") {
                    newData.forms = {};
                    if (typeof type.forms === "function") {
                        newData.forms = yield type.forms(req);
                    }
                    for (let form in type.forms) {
                        if (!type.forms[form] || !type.forms[form].fields || type.forms[form].fields.length < 1) {
                            continue;
                        }
                        newData.forms[form] = {};
                        if (typeof type.forms[form].pageActions === "function") {
                            newData.forms[form].pageActions = yield type.forms[form].pageActions(req);
                        }
                        else if (type.forms[form].pageActions) {
                            newData.forms[form].pageActions = JSON.parse(JSON.stringify(type.forms[form].pageActions));
                        }
                        if (typeof type.forms[form].backLink === "function") {
                            newData.forms[form].backLink = yield type.forms[form].backLink(req);
                        }
                        if (typeof type.forms[form].fields === "function") {
                            newData.forms[form].fields = yield type.forms[form].fields(req);
                        }
                        else if (type.forms[form].fields) {
                            newData.forms[form].fields = JSON.parse(JSON.stringify(type.forms[form].fields));
                        }
                        newData.forms[form].allowDeletion =
                            (typeof type.forms[form].allowDeletion === "boolean" && type.forms[form].allowDeletion) ||
                                (typeof type.forms[form].allowDeletion === "function" && (yield type.forms[form].allowDeletion(req)))
                                ? true
                                : false;
                    }
                }
                else {
                    newData[key] = type[key];
                }
            }
            return newData;
        });
    }
    loadType(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const type = this.getTypeFromRequest(req);
            const data = Object.assign(Object.assign({}, (yield this.typeForFrontend(type, req))), { fieldtypes: this.getFieldTypesFrontend(), new_data_handler: type.schema && type.schema.newDataHandler && typeof type.schema.newDataHandler === "function" ? true : false });
            return {
                status: "success",
                data: Object.assign(Object.assign({}, data), { schema: Object.assign(Object.assign({}, (data.schema ? data.schema : {})), { fields: yield this.getFieldsFrontend(type.schema
                            ? typeof type.schema.fields === "function"
                                ? yield type.schema.fields(req)
                                : type.schema.fields
                            : typeof type.fields === "function"
                                ? yield type.fields(req)
                                : type.fields, req) }) }),
            };
        });
    }
    applyFields(fields, element, data, payload, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof fields !== "object" || !fields) {
                return element;
            }
            for (let key in fields) {
                if (!fields[key] || fields[key].unmapped) {
                    continue;
                }
                const fieldPath = (path ? path + "." : "") + key;
                const value = lodash_1.default.get(data, fieldPath);
                const customType = this.getFieldType(fields[key].type);
                if (typeof fields[key].schema === "object" && fields[key].type === "array") {
                    lodash_1.default.set(element, fieldPath, []);
                    if (value && value.length > 0) {
                        for (let i in value) {
                            const entryPath = fieldPath + "[" + i + "]";
                            this.applyFields(fields[key].schema, element, data, payload, entryPath);
                        }
                    }
                    if (customType && typeof customType.onSave === "function") {
                        lodash_1.default.set(element, fieldPath, yield customType.onSave(lodash_1.default.get(element, fieldPath), Object.assign(Object.assign({}, payload), fields[key].payload)));
                    }
                }
                else {
                    let elementVal = null;
                    if (fields[key].type === "ObjectId") {
                        if (value && (value.toString().length === 12 || value.toString().length === 24)) {
                            elementVal = typeof value === "string" ? yield Model_1.Model.objectId(value) : value;
                        }
                        else {
                            elementVal = yield Model_1.Model.objectId();
                        }
                    }
                    else if (value !== undefined &&
                        value !== null &&
                        !(typeof value === "string" && value.trim() === "") &&
                        !(typeof value === "number" && value.toString().trim() === "")) {
                        // Custom field onSave
                        if (customType && typeof customType.onSave === "function") {
                            elementVal = yield customType.onSave(value, Object.assign(Object.assign({}, payload), fields[key].payload));
                        }
                        // Float or currency fields
                        else if (fields[key].type === "currency" || fields[key].type === "float") {
                            elementVal = parseFloat(value.toString().replace(",", "."));
                        }
                        // Integer field
                        else if (fields[key].type === "integer") {
                            elementVal = parseInt(value);
                        }
                        // Standard
                        else {
                            elementVal = value;
                        }
                    }
                    lodash_1.default.set(element, fieldPath, elementVal);
                }
            }
            return element;
        });
    }
    getAggregation(type, req) {
        return __awaiter(this, void 0, void 0, function* () {
            return [
                {
                    $match: {
                        [type.schema.primaryKey ? type.schema.primaryKey : "_id"]: type.schema.primaryKeyPlain
                            ? req.body.__builder_id
                            : yield Model_1.Model.objectId(req.body.__builder_id),
                    },
                },
            ];
        });
    }
    save(db, req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!req || !req.body || typeof req.body !== "object" || !req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
                throw new Error("Missing id ...");
            }
            if (typeof req.body.data !== "object") {
                throw new Error("Missing id ...");
            }
            const type = this.getTypeFromRequest(req.body);
            if (!type || !type.schema || !type.schema.fields) {
                throw new Error("Missing schema fields ...");
            }
            const schemaFields = typeof type.schema.fields === "function" ? yield type.schema.fields(req) : type.schema.fields;
            const errors = yield this.validateFields(db, type, schemaFields, req);
            if (errors && Object.keys(errors).length > 0) {
                return {
                    status: "error",
                    errors: errors,
                };
            }
            const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
            if (!collection || collection.trim() === "") {
                throw new Error("Missing collection ...");
            }
            let element = null;
            let updateId = null;
            if (req.body.__builder_id === "new") {
                element = {};
                if (type.schema.primaryKey && type.schema.primaryKey.trim() !== "" && type.schema.primaryKey !== "_id") {
                    element[type.schema.primaryKey] = type.schema.primaryKeyPlain
                        ? req.body.__builder_id
                        : yield Model_1.Model.objectId(req.body.builder_id);
                }
                element.__builder = {
                    created_at: new Date(),
                };
            }
            else {
                const result = yield db
                    .collection(collection)
                    .aggregate(type.schema && typeof type.schema.getAggregation === "function"
                    ? yield type.schema.getAggregation(yield this.getAggregation(type, req), req)
                    : yield this.getAggregation(type, req), collection)
                    .toArray();
                if (!result || !result[0] || !result[0][type.schema.primaryKey ? type.schema.primaryKey : "_id"]) {
                    throw new Error("Element '" + req.body.__builder_id + "' not found ...");
                }
                element = result[0];
                updateId = result[0][type.schema.primaryKey ? type.schema.primaryKey : "_id"];
            }
            element = yield this.applyFields(schemaFields, element, req.body.data, req.body.payload);
            if (!element.__builder) {
                element.__builder = {};
            }
            element.__builder.version = type.schema.version;
            element.__builder.collection = type.schema.collection;
            element.__builder.updated_at = new Date();
            try {
                if (typeof type.schema.beforeSave === "function") {
                    yield type.schema.beforeSave(element, req);
                }
            }
            catch (e) {
                throw e;
            }
            let changedId = null;
            if (updateId) {
                delete element[type.schema.primaryKey ? type.schema.primaryKey : "_id"];
                const status = yield db.collection(collection).updateOne({
                    _id: type.schema.primaryKeyPlain ? updateId.toString() : yield Model_1.Model.objectId(updateId),
                }, { $set: Object.assign({}, element) });
                if (status && status.matchedCount) {
                    changedId = updateId;
                    element[type.schema.primaryKey ? type.schema.primaryKey : "_id"] = type.schema.primaryKeyPlain
                        ? changedId.toString()
                        : changedId;
                }
            }
            else {
                const status = yield db
                    .collection(collection)
                    .insertOne(Object.assign(Object.assign({}, element), { [type.schema.primaryKey ? type.schema.primaryKey : "_id"]: undefined }));
                if (status && status.insertedId) {
                    changedId = status.insertedId;
                    element[type.schema.primaryKey ? type.schema.primaryKey : "_id"] = type.schema.primaryKeyPlain
                        ? changedId.toString()
                        : changedId;
                }
            }
            try {
                if (typeof type.schema.afterSave === "function") {
                    yield type.schema.afterSave(element, req);
                }
            }
            catch (e) {
                throw e;
            }
            let redirect = undefined;
            const forms = typeof type.forms === "function" ? yield type.forms(req) : type.forms;
            if (forms && forms.main && forms.main.onSaveRedirect && typeof forms.main.onSaveRedirect === "function") {
                redirect = yield forms.main.onSaveRedirect(element, req);
            }
            return {
                status: "success",
                data: {
                    _id: changedId,
                    redirect: redirect,
                },
            };
        });
    }
    delete(db, req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!req || !req.body || typeof req.body !== "object" || !req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
                throw new Error("Missing id ...");
            }
            if (typeof req.body.data !== "object") {
                throw new Error("Missing id ...");
            }
            const type = this.getTypeFromRequest(req.body);
            if (!type || !type.schema || !type.schema.fields) {
                throw new Error("Missing schema fields ...");
            }
            const canDelete = typeof type.schema.canDelete === "function" ? yield type.schema.canDelete(req) : true;
            if (!canDelete) {
                throw new Error("Cannot delete entry ...");
            }
            const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
            if (!collection || collection.trim() === "") {
                throw new Error("Missing collection ...");
            }
            let element = null;
            if (req.body.__builder_id === "new") {
                throw new Error("Cannot delete a new object ...");
            }
            else {
                const result = yield db
                    .collection(collection)
                    .aggregate(type.schema && typeof type.schema.getAggregation === "function"
                    ? yield type.schema.getAggregation(yield this.getAggregation(type, req), req)
                    : yield this.getAggregation(type, req), collection)
                    .toArray();
                if (!result || !result[0] || !result[0][type.schema.primaryKey ? type.schema.primaryKey : "_id"]) {
                    throw new Error("Element '" + req.body.__builder_id + "' not found ...");
                }
                element = result[0];
            }
            if (!element || !element._id) {
                throw new Error("Element '" + req.body.__builder_id + "' not found ...");
            }
            try {
                if (typeof type.schema.beforeDelete === "function") {
                    yield type.schema.beforeDelete(element, req);
                }
            }
            catch (e) {
                throw e;
            }
            yield db.collection(collection).deleteOne({ _id: element._id });
            try {
                if (typeof type.schema.afterDelete === "function") {
                    yield type.schema.afterDelete(element, req);
                }
            }
            catch (e) {
                throw e;
            }
            let redirect = undefined;
            const forms = typeof type.forms === "function" ? yield type.forms(req) : type.forms;
            if (forms && forms.main && forms.main.onDeleteRedirect && typeof forms.main.onDeleteRedirect === "function") {
                redirect = yield forms.main.onDeleteRedirect(element, req);
            }
            else if (forms && forms.main && forms.main.onSaveRedirect && typeof forms.main.onSaveRedirect === "function") {
                redirect = yield forms.main.onSaveRedirect(element, req);
            }
            return {
                status: "success",
                data: {
                    _id: element._id,
                    redirect: redirect,
                },
            };
        });
    }
    getField(req, type, path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!path || path.trim() === "") {
                return null;
            }
            const schemaFields = typeof type.schema.fields === "function" ? yield type.schema.fields(req) : type.schema.fields;
            const field = lodash_1.default.get(schemaFields, this.removeArrayIndicators(path));
            return field && field.type ? field : null;
        });
    }
    removeArrayIndicators(str) {
        return str.replace(/\[\d+\]/g, ".schema");
    }
    details(db, req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
                throw new Error("Missing id ...");
            }
            const type = this.getTypeFromRequest(req);
            if (!type || !type.schema || !type.schema.fields) {
                throw new Error("Missing schema fields ...");
            }
            const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
            let element = null;
            try {
                element = yield db
                    .collection(collection)
                    .aggregate(type.schema && typeof type.schema.getAggregation === "function"
                    ? yield type.schema.getAggregation(yield this.getAggregation(type, req), req)
                    : yield this.getAggregation(type, req), collection)
                    .toArray();
            }
            catch (e) {
                console.error(e);
                throw e;
            }
            if (!element || !element[0] || !element[0][type.schema.primaryKey ? type.schema.primaryKey : "_id"]) {
                throw new Error("Element '" + req.body.__builder_id + "' not found ...");
            }
            return {
                status: "success",
                data: element[0],
            };
        });
    }
    detailsNewData(db, req) {
        return __awaiter(this, void 0, void 0, function* () {
            const type = this.getTypeFromRequest(req);
            if (!type || !type.schema || !type.schema.fields) {
                throw new Error("Missing schema fields ...");
            }
            if (!type.schema || !type.schema.newDataHandler || typeof type.schema.newDataHandler !== "function") {
                throw new Error("Missing newDataHandler-Function ...");
            }
            let data = null;
            try {
                data = yield type.schema.newDataHandler(req);
            }
            catch (e) {
                console.error(e);
            }
            if (data === null || data === undefined) {
                return { status: "error", message: "Unexpected error generating the forms 'new-data' ..." };
            }
            return {
                status: "success",
                data: data,
            };
        });
    }
    apiAutoComplete(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const type = this.getTypeFromRequest(req);
            const field = req.body.__builder_field ? yield this.getField(req, type, req.body.__builder_field) : null;
            if (!field) {
                throw new Error("Invalid autocomplete field ...");
            }
            const fieldType = this.getFieldType(field.type);
            if (!fieldType || !fieldType.key || fieldType.type !== "api-autocomplete" || !fieldType.onSearch) {
                throw new Error("Invalid autocomplete field type '" + field.type + "' ...");
            }
            req.body.payload = Object.assign(Object.assign({}, req.body.payload), field.payload);
            req.field = field;
            return {
                status: "success",
                data: yield fieldType.onSearch(req.body.query, req),
            };
        });
    }
}
exports.DataBuilder = DataBuilder;
