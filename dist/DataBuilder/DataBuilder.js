"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
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
exports.DataBuilder = exports.DataBuilderFieldType = void 0;
const DBConnection_1 = require("../Database/DBConnection");
const DataBuilderForms_1 = require("./DataBuilderForms");
const DataBuilderFieldsProcessor_1 = require("./DataBuilderFieldsProcessor");
const DataBuilderFrontend_1 = require("./DataBuilderFrontend");
const formScope_1 = require("./formScope");
__exportStar(require("./DataBuilderTypes"), exports);
var DataBuilderFieldType_1 = require("./DataBuilderFieldType");
Object.defineProperty(exports, "DataBuilderFieldType", { enumerable: true, get: function () { return DataBuilderFieldType_1.DataBuilderFieldType; } });
class DataBuilder {
    constructor(connection) {
        this.connection = connection;
        this.forms = new DataBuilderForms_1.DataBuilderForms((type) => this.registerType(type));
        this.fields = new DataBuilderFieldsProcessor_1.DataBuilderFieldsProcessor(connection, this);
    }
    objectId(value) {
        return DBConnection_1.DBConnection.objectId(value, this.connection);
    }
    resolveType(req) {
        return this.forms.resolve(this.getTypeFromRequest(req), req);
    }
    getType(key) {
        return this.forms.get(key);
    }
    registerType(type) {
        this.forms.register(type);
        return this;
    }
    registerModelType(key, model) {
        this.forms.registerModel(key, model);
        return this;
    }
    registerFieldType(key, options) {
        this.fields.registerFieldType(key, options);
        return this;
    }
    registerValidationType(rule) {
        this.fields.registerValidationType(rule);
        return this;
    }
    getFieldType(key) {
        return this.fields.getFieldType(key);
    }
    getFieldTypeInstance(key) {
        return this.fields.getFieldTypeInstance(key);
    }
    getFieldTypesFrontend() {
        return this.fields.getFieldTypesFrontend();
    }
    getFieldsFrontend(fields, payload) {
        return (0, DataBuilderFrontend_1.fieldsForFrontend)(fields, payload, (children, childPayload) => this.getFieldsFrontend(children, childPayload));
    }
    typeForFrontend(type, req, structured = false) {
        return (0, DataBuilderFrontend_1.typeForFrontend)(type, req, structured);
    }
    validateFields(db, type, fields, req, errors, path, structured = false) {
        return this.fields.validateFields(db, type, fields, req, errors, path, structured);
    }
    handleUnique(db, req, key, value, field, type) {
        return this.fields.handleUnique(db, req, key, value, field, type);
    }
    applyFields(fields, element, data, payload, path, structured = false, request) {
        return this.fields.applyFields(fields, element, data, payload, path, structured, request);
    }
    getField(req, type, path) {
        return this.fields.getField(req, type, path);
    }
    removeArrayIndicators(path) {
        return this.fields.removeArrayIndicators(path);
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
    loadType(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const { type, structured } = yield this.resolveType(req);
            const data = Object.assign(Object.assign({}, (yield this.typeForFrontend(type, req, structured))), { fieldtypes: this.getFieldTypesFrontend(), new_data_handler: type.schema && type.schema.newDataHandler && typeof type.schema.newDataHandler === "function" ? true : false });
            return {
                status: "success",
                data: Object.assign(Object.assign({}, data), { schema: Object.assign(Object.assign({}, (data.schema ? data.schema : {})), { fields: yield this.getFieldsFrontend(type.schema ? (typeof type.schema.fields === "function" ? yield type.schema.fields(req) : type.schema.fields) : {}, req) }) }),
            };
        });
    }
    getAggregation(type, req) {
        return __awaiter(this, void 0, void 0, function* () {
            return [
                {
                    $match: {
                        [type.schema.primaryKey ? type.schema.primaryKey : "_id"]: type.schema.primaryKeyPlain
                            ? req.body.__builder_id
                            : yield this.objectId(req.body.__builder_id),
                    },
                },
            ];
        });
    }
    loadElement(db, type, req) {
        return __awaiter(this, void 0, void 0, function* () {
            const collection = type.schema.collection;
            const aggregation = yield this.getAggregation(type, req);
            const result = yield db
                .collection(collection)
                .aggregate(typeof type.schema.getAggregation === "function" ? yield type.schema.getAggregation(aggregation, req) : aggregation, collection)
                .toArray();
            const element = result === null || result === void 0 ? void 0 : result[0];
            if (!(element === null || element === void 0 ? void 0 : element[type.schema.primaryKey || "_id"])) {
                throw new Error("Element '" + req.body.__builder_id + "' not found ...");
            }
            return element;
        });
    }
    save(db, req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!req || !req.body || typeof req.body !== "object") {
                throw new Error("Missing request-body ...");
            }
            if (!req.body.data || typeof req.body.data !== "object" || Array.isArray(req.body.data)) {
                throw new Error("Missing request-data ...");
            }
            const { type, structured } = yield this.resolveType(req);
            if (!type || !type.schema || !type.schema.fields) {
                throw new Error("Missing schema fields ...");
            }
            const schemaFields = typeof type.schema.fields === "function" ? yield type.schema.fields(req) : type.schema.fields;
            const errors = Object.assign({}, (yield this.validateFields(db, type, schemaFields, req, undefined, undefined, structured)));
            if (structured)
                (0, formScope_1.unexpectedFormFields)(schemaFields, req.body.data, errors, "", type.schema.primaryKey || "_id");
            if (errors && Object.keys(errors).length > 0) {
                return {
                    status: "error",
                    errors: errors,
                };
            }
            if (type.unmapped) {
                const appendData = {};
                if (typeof type.schema.beforeSave === "function") {
                    const result = yield type.schema.beforeSave(req.body.data, req);
                    if (result && result.__append_data) {
                        Object.assign(appendData, result.__append_data);
                    }
                }
                if (typeof type.schema.afterSave === "function") {
                    const result = yield type.schema.afterSave(req.body.data, req);
                    if (result && result.__append_data) {
                        Object.assign(appendData, result.__append_data);
                    }
                }
                let redirect = undefined;
                const forms = typeof type.forms === "function" ? yield type.forms(req) : type.forms;
                if (forms && forms.main && forms.main.onSaveRedirect && typeof forms.main.onSaveRedirect === "function") {
                    redirect = yield forms.main.onSaveRedirect(req.body.data, req);
                }
                return {
                    status: "success",
                    data: Object.assign({ _id: req.body.data._id ? req.body.data._id : "__unmapped", redirect: redirect }, appendData),
                };
            }
            if (!req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
                throw new Error("Missing id ...");
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
                        : yield this.objectId(req.body.builder_id);
                }
                element.__builder = {
                    created_at: new Date(),
                };
            }
            else {
                element = yield this.loadElement(db, type, req);
                updateId = element[type.schema.primaryKey || "_id"];
            }
            element = yield this.applyFields(schemaFields, element, req.body.data, req.body.payload, undefined, structured, req);
            if (!element.__builder) {
                element.__builder = {};
            }
            element.__builder.version = type.schema.version;
            element.__builder.collection = type.schema.collection;
            element.__builder.updated_at = new Date();
            if (typeof type.schema.beforeSave === "function") {
                yield type.schema.beforeSave(element, req);
            }
            let changedId = null;
            if (updateId) {
                delete element[type.schema.primaryKey ? type.schema.primaryKey : "_id"];
                const status = yield db.collection(collection).updateOne({
                    _id: type.schema.primaryKeyPlain ? updateId.toString() : yield this.objectId(updateId),
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
            if (typeof type.schema.afterSave === "function") {
                yield type.schema.afterSave(element, req);
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
            const { type } = yield this.resolveType(req);
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
                element = yield this.loadElement(db, type, req);
            }
            if (!element || !element._id) {
                throw new Error("Element '" + req.body.__builder_id + "' not found ...");
            }
            if (typeof type.schema.beforeDelete === "function") {
                yield type.schema.beforeDelete(element, req);
            }
            if (typeof type.schema.deleteHandler === "function")
                yield type.schema.deleteHandler(element, req);
            else
                yield db.collection(collection).deleteOne({ _id: element._id });
            if (typeof type.schema.afterDelete === "function") {
                yield type.schema.afterDelete(element, req);
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
    details(db, req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
                throw new Error("Missing id ...");
            }
            const { type, structured } = yield this.resolveType(req);
            if (!type || !type.schema || !type.schema.fields) {
                throw new Error("Missing schema fields ...");
            }
            const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
            if (!collection)
                throw new Error("Missing schema collection ...");
            const element = yield this.loadElement(db, type, req);
            return {
                status: "success",
                data: structured
                    ? Object.assign(Object.assign({}, (0, formScope_1.projectFormData)(type.schema.fields, element)), { [type.schema.primaryKey || "_id"]: element[type.schema.primaryKey || "_id"] }) : element,
            };
        });
    }
    detailsNewData(db, req) {
        return __awaiter(this, void 0, void 0, function* () {
            const { type, structured } = yield this.resolveType(req);
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
                data: structured ? (0, formScope_1.projectFormData)(type.schema.fields, data) : data,
            };
        });
    }
    apiAutoComplete(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const { type } = yield this.resolveType(req);
            const field = req.body.__builder_field ? yield this.getField(req, type, req.body.__builder_field) : null;
            if (!field) {
                throw new Error("Invalid autocomplete field ...");
            }
            const fieldType = this.getFieldTypeInstance(field.type);
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
