import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import { Request } from "../Router/Request";
import { DBConnection } from "../Database/DBConnection";
import { DataBuilderFieldType, DataBuilderFieldTypeInstance } from "./DataBuilderFieldType";
import { DataBuilderValidationType } from "./DataBuilderValidationType";
import { DataBuilderForms } from "./DataBuilderForms";
import { DataBuilderFieldsProcessor } from "./DataBuilderFieldsProcessor";
import { fieldsForFrontend, typeForFrontend } from "./DataBuilderFrontend";
import { projectFormData, unexpectedFormFields } from "./formScope";
import type { DataBuilderType, DataBuilderFields, DataBuilderErrors } from "./DataBuilderTypes";

export * from "./DataBuilderTypes";
export { DataBuilderFieldType } from "./DataBuilderFieldType";

export class DataBuilder {
    private readonly forms = new DataBuilderForms((type) => this.registerType(type));
    private readonly fields: DataBuilderFieldsProcessor;

    constructor(private readonly connection?: string) {
        this.fields = new DataBuilderFieldsProcessor(connection, this);
    }

    private objectId(value?: any) {
        return DBConnection.objectId(value, this.connection);
    }

    private resolveType(req: Request) {
        return this.forms.resolve(this.getTypeFromRequest(req), req);
    }

    getType(key: string) {
        return this.forms.get(key);
    }

    registerType(type: DataBuilderType) {
        this.forms.register(type);
        return this;
    }

    registerModelType(key: string, model: any) {
        this.forms.registerModel(key, model);
        return this;
    }

    registerFieldType(
        key: string | DataBuilderFieldType | DataBuilderFieldTypeInstance | (new () => DataBuilderFieldTypeInstance),
        options?: any,
    ) {
        this.fields.registerFieldType(key, options);
        return this;
    }

    registerValidationType(rule: DataBuilderValidationType | (new () => DataBuilderValidationType)) {
        this.fields.registerValidationType(rule);
        return this;
    }

    getFieldType(key: string): DataBuilderFieldType | null {
        return this.fields.getFieldType(key);
    }

    getFieldTypeInstance(key: string): DataBuilderFieldTypeInstance | null {
        return this.fields.getFieldTypeInstance(key);
    }

    getFieldTypesFrontend() {
        return this.fields.getFieldTypesFrontend();
    }

    getFieldsFrontend(fields: DataBuilderFields, payload?: any): Promise<DataBuilderFields> {
        return fieldsForFrontend(fields, payload, (children, childPayload) => this.getFieldsFrontend(children, childPayload));
    }

    typeForFrontend(type: DataBuilderType, req: Request, structured = false) {
        return typeForFrontend(type, req, structured);
    }

    validateFields(
        db: DocumentDatabase,
        type: DataBuilderType,
        fields: DataBuilderFields,
        req: Request,
        errors?: DataBuilderErrors,
        path?: string,
        structured = false,
    ): Promise<DataBuilderErrors> {
        return this.fields.validateFields(db, type, fields, req, errors, path, structured);
    }

    handleUnique(db: DocumentDatabase, req: Request, key: string, value: any, field: any, type: DataBuilderType) {
        return this.fields.handleUnique(db, req, key, value, field, type);
    }

    applyFields(fields: DataBuilderFields, element: any, data: any, payload: any, path?: string, structured = false, request?: Request) {
        return this.fields.applyFields(fields, element, data, payload, path, structured, request);
    }

    getField(req: Request, type: DataBuilderType, path: string) {
        return this.fields.getField(req, type, path);
    }

    removeArrayIndicators(path: string) {
        return this.fields.removeArrayIndicators(path);
    }

    getTypeFromRequest(req: any) {
        const type =
            req.body && req.body.__builder_type
                ? this.getType(req.body.__builder_type)
                : req.__builder_type
                  ? this.getType(req.__builder_type)
                  : null;
        if (!type) {
            throw new Error(
                "Missing builder-type '" + (req.body && req.body.__builder_type ? req.body.__builder_type : req.__builder_type) + "' ...",
            );
        }
        return type;
    }

    async loadType(req: Request) {
        const { type, structured } = await this.resolveType(req);

        const data = {
            ...(await this.typeForFrontend(type, req, structured)),
            fieldtypes: this.getFieldTypesFrontend(),
            new_data_handler: type.schema && type.schema.newDataHandler && typeof type.schema.newDataHandler === "function" ? true : false,
        };
        return {
            status: "success",
            data: {
                ...data,
                schema: {
                    ...(data.schema ? data.schema : {}),
                    fields: await this.getFieldsFrontend(
                        type.schema ? (typeof type.schema.fields === "function" ? await type.schema.fields(req) : type.schema.fields) : {},
                        req,
                    ),
                },
            },
        };
    }

    async getAggregation(type: DataBuilderType, req: Request) {
        return [
            {
                $match: {
                    [type.schema.primaryKey ? type.schema.primaryKey : "_id"]: type.schema.primaryKeyPlain
                        ? req.body.__builder_id
                        : await this.objectId(req.body.__builder_id),
                },
            },
        ];
    }

    private async loadElement(db: DocumentDatabase, type: DataBuilderType, req: Request) {
        const collection = type.schema.collection!;
        const aggregation = await this.getAggregation(type, req);
        const result = await db
            .collection(collection)
            .aggregate(
                typeof type.schema.getAggregation === "function" ? await type.schema.getAggregation(aggregation, req) : aggregation,
                collection,
            )
            .toArray();
        const element = result?.[0];
        if (!element?.[type.schema.primaryKey || "_id"]) {
            throw new Error("Element '" + req.body.__builder_id + "' not found ...");
        }
        return element;
    }

    async save(db: DocumentDatabase, req: Request) {
        if (!req || !req.body || typeof req.body !== "object") {
            throw new Error("Missing request-body ...");
        }

        if (!req.body.data || typeof req.body.data !== "object" || Array.isArray(req.body.data)) {
            throw new Error("Missing request-data ...");
        }

        const { type, structured } = await this.resolveType(req);
        if (!type || !type.schema || !type.schema.fields) {
            throw new Error("Missing schema fields ...");
        }

        const schemaFields = typeof type.schema.fields === "function" ? await type.schema.fields(req) : type.schema.fields;
        const errors: DataBuilderErrors = {
            ...(await this.validateFields(db, type, schemaFields, req, undefined, undefined, structured)),
        };
        if (structured) unexpectedFormFields(schemaFields, req.body.data, errors, "", type.schema.primaryKey || "_id");
        if (errors && Object.keys(errors).length > 0) {
            return {
                status: "error",
                errors: errors,
            };
        }

        if (type.unmapped) {
            const appendData: any = {};
            if (typeof type.schema.beforeSave === "function") {
                const result = await type.schema.beforeSave(req.body.data, req);
                if (result && result.__append_data) {
                    Object.assign(appendData, result.__append_data);
                }
            }

            if (typeof type.schema.afterSave === "function") {
                const result = await type.schema.afterSave(req.body.data, req);
                if (result && result.__append_data) {
                    Object.assign(appendData, result.__append_data);
                }
            }

            let redirect: any = undefined;
            const forms = typeof type.forms === "function" ? await type.forms(req) : type.forms;
            if (forms && forms.main && forms.main.onSaveRedirect && typeof forms.main.onSaveRedirect === "function") {
                redirect = await forms.main.onSaveRedirect(req.body.data, req);
            }

            return {
                status: "success",
                data: {
                    _id: req.body.data._id ? req.body.data._id : "__unmapped",
                    redirect: redirect,
                    ...appendData,
                },
            };
        }

        if (!req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
            throw new Error("Missing id ...");
        }

        const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
        if (!collection || collection.trim() === "") {
            throw new Error("Missing collection ...");
        }

        let element: any = null;
        let updateId: any = null;
        if (req.body.__builder_id === "new") {
            element = {};
            if (type.schema.primaryKey && type.schema.primaryKey.trim() !== "" && type.schema.primaryKey !== "_id") {
                element[type.schema.primaryKey] = type.schema.primaryKeyPlain
                    ? req.body.__builder_id
                    : await this.objectId(req.body.builder_id);
            }

            element.__builder = {
                created_at: new Date(),
            };
        } else {
            element = await this.loadElement(db, type, req);
            updateId = element[type.schema.primaryKey || "_id"];
        }

        element = await this.applyFields(schemaFields, element, req.body.data, req.body.payload, undefined, structured, req);
        if (!element.__builder) {
            element.__builder = {};
        }
        element.__builder.version = type.schema.version;
        element.__builder.collection = type.schema.collection;
        element.__builder.updated_at = new Date();

        if (typeof type.schema.beforeSave === "function") {
            await type.schema.beforeSave(element, req);
        }

        let changedId: any = null;
        if (updateId) {
            delete element[type.schema.primaryKey ? type.schema.primaryKey : "_id"];

            const status = await db.collection(collection).updateOne(
                {
                    _id: type.schema.primaryKeyPlain ? updateId.toString() : await this.objectId(updateId),
                },
                { $set: { ...element } },
            );
            if (status && status.matchedCount) {
                changedId = updateId;
                element[type.schema.primaryKey ? type.schema.primaryKey : "_id"] = type.schema.primaryKeyPlain
                    ? changedId.toString()
                    : changedId;
            }
        } else {
            const status = await db
                .collection(collection)
                .insertOne({ ...element, [type.schema.primaryKey ? type.schema.primaryKey : "_id"]: undefined });
            if (status && status.insertedId) {
                changedId = status.insertedId;
                element[type.schema.primaryKey ? type.schema.primaryKey : "_id"] = type.schema.primaryKeyPlain
                    ? changedId.toString()
                    : changedId;
            }
        }

        if (typeof type.schema.afterSave === "function") {
            await type.schema.afterSave(element, req);
        }

        let redirect: any = undefined;
        const forms = typeof type.forms === "function" ? await type.forms(req) : type.forms;
        if (forms && forms.main && forms.main.onSaveRedirect && typeof forms.main.onSaveRedirect === "function") {
            redirect = await forms.main.onSaveRedirect(element, req);
        }

        return {
            status: "success",
            data: {
                _id: changedId,
                redirect: redirect,
            },
        };
    }

    async delete(db: DocumentDatabase, req: Request) {
        if (!req || !req.body || typeof req.body !== "object" || !req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
            throw new Error("Missing id ...");
        }

        if (typeof req.body.data !== "object") {
            throw new Error("Missing id ...");
        }

        const { type } = await this.resolveType(req);
        if (!type || !type.schema || !type.schema.fields) {
            throw new Error("Missing schema fields ...");
        }

        const canDelete = typeof type.schema.canDelete === "function" ? await type.schema.canDelete(req) : true;
        if (!canDelete) {
            throw new Error("Cannot delete entry ...");
        }

        const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
        if (!collection || collection.trim() === "") {
            throw new Error("Missing collection ...");
        }

        let element: any = null;
        if (req.body.__builder_id === "new") {
            throw new Error("Cannot delete a new object ...");
        } else {
            element = await this.loadElement(db, type, req);
        }

        if (!element || !element._id) {
            throw new Error("Element '" + req.body.__builder_id + "' not found ...");
        }

        if (typeof type.schema.beforeDelete === "function") {
            await type.schema.beforeDelete(element, req);
        }

        if (typeof type.schema.deleteHandler === "function") await type.schema.deleteHandler(element, req);
        else await db.collection(collection).deleteOne({ _id: element._id });

        if (typeof type.schema.afterDelete === "function") {
            await type.schema.afterDelete(element, req);
        }

        let redirect: any = undefined;
        const forms = typeof type.forms === "function" ? await type.forms(req) : type.forms;
        if (forms && forms.main && forms.main.onDeleteRedirect && typeof forms.main.onDeleteRedirect === "function") {
            redirect = await forms.main.onDeleteRedirect(element, req);
        } else if (forms && forms.main && forms.main.onSaveRedirect && typeof forms.main.onSaveRedirect === "function") {
            redirect = await forms.main.onSaveRedirect(element, req);
        }

        return {
            status: "success",
            data: {
                _id: element._id,
                redirect: redirect,
            },
        };
    }

    async details(db: DocumentDatabase, req: Request) {
        if (!req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
            throw new Error("Missing id ...");
        }

        const { type, structured } = await this.resolveType(req);
        if (!type || !type.schema || !type.schema.fields) {
            throw new Error("Missing schema fields ...");
        }

        const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
        if (!collection) throw new Error("Missing schema collection ...");
        const element = await this.loadElement(db, type, req);

        return {
            status: "success",
            data: structured
                ? {
                      ...projectFormData(type.schema.fields as DataBuilderFields, element),
                      [type.schema.primaryKey || "_id"]: element[type.schema.primaryKey || "_id"],
                  }
                : element,
        };
    }

    async detailsNewData(db: DocumentDatabase, req: Request) {
        const { type, structured } = await this.resolveType(req);
        if (!type || !type.schema || !type.schema.fields) {
            throw new Error("Missing schema fields ...");
        }

        if (!type.schema || !type.schema.newDataHandler || typeof type.schema.newDataHandler !== "function") {
            throw new Error("Missing newDataHandler-Function ...");
        }

        let data: any = null;
        try {
            data = await type.schema.newDataHandler(req);
        } catch (e: any) {
            console.error(e);
        }

        if (data === null || data === undefined) {
            return { status: "error", message: "Unexpected error generating the forms 'new-data' ..." };
        }

        return {
            status: "success",
            data: structured ? projectFormData(type.schema.fields as DataBuilderFields, data) : data,
        };
    }

    async apiAutoComplete(req: Request) {
        const { type } = await this.resolveType(req);
        const field = req.body.__builder_field ? await this.getField(req, type, req.body.__builder_field) : null;
        if (!field) {
            throw new Error("Invalid autocomplete field ...");
        }

        const fieldType = this.getFieldTypeInstance(field.type);
        if (!fieldType || !fieldType.key || fieldType.type !== "api-autocomplete" || !fieldType.onSearch) {
            throw new Error("Invalid autocomplete field type '" + field.type + "' ...");
        }

        req.body.payload = { ...req.body.payload, ...field.payload };
        req.field = field;
        return {
            status: "success",
            data: await fieldType.onSearch(req.body.query, req),
        };
    }
}
