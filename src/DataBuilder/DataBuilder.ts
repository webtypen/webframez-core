import lodash from "lodash";
import { Request } from "../Router/Request";
import { Model } from "../Database/Model";

export type DataBuilderSchema = {
    version: string;
    collection?: string;
    primaryKey?: string;
    primaryKeyPlain?: boolean;
    beforeSave?: any;
    afterSave?: any;
    getAggregation?: any;
    events?: { [key: string]: any };
    fields: { [key: string]: any };
    newDataHandler?: Function;
};

export type DataBuilderType = {
    key: string;
    singular: string;
    plural: string;
    schema: DataBuilderSchema;
    forms?: { [key: string]: any };
};

export type DataBuilderFieldType =
    | {
          key: string;
          type: "api-autocomplete";
          onSave: (value: any, payload?: any) => void;
          onSearch: (query: string, req: Request) => void;
      }
    | {
          key: string;
          type: "object";
          onSave: (value: any, payload?: any) => void;
          onSearch?: never;
      };

export class DataBuilder {
    private types: { [key: string]: DataBuilderType } = {};
    private fieldTypes: { [key: string]: DataBuilderFieldType } = {};

    getType(key: string) {
        return this.types[key] && this.types[key].key ? this.types[key] : null;
    }

    registerType(typeObj: DataBuilderType) {
        this.types[typeObj.key] = typeObj;
        return this;
    }

    registerFieldType(key: string, options?: any) {
        this.fieldTypes[key] = { ...options, key: key };
        return this;
    }

    registerModelType(key: string, model: any) {
        if (
            model &&
            typeof model.__schema === "object" &&
            model.__schema.fields &&
            (Object.keys(model.__schema.fields).length > 0 || typeof model.__schema.fields === "function")
        ) {
            this.registerType({
                key: key,
                singular: model.__singular,
                plural: model.__plural,
                schema: { ...model.__schema, collection: key },
                forms: model.__forms,
            });
        }
        return this;
    }

    getFieldType(key: string) {
        return this.fieldTypes[key] && this.fieldTypes[key].key ? this.fieldTypes[key] : null;
    }

    getFieldTypesFrontend() {
        const fieldtypes: any = {};
        for (let key in this.fieldTypes) {
            fieldtypes[key] = {
                key: key,
                type: this.fieldTypes[key].type,
            };
        }

        return fieldtypes;
    }

    async getFieldsFrontend(fields: any, payload?: any) {
        const out: any = {};
        for (let key in fields) {
            if (fields[key].type === "object") {
                out[key] =
                    typeof fields[key].schema === "object" && Object.keys(fields[key].schema).length > 0
                        ? { ...(await this.getFieldsFrontend(fields[key].schema, payload)) }
                        : fields[key];
            } else {
                out[key] =
                    typeof fields[key].schema === "object" && Object.keys(fields[key].schema).length > 0
                        ? { ...fields[key], schema: await this.getFieldsFrontend(fields[key].schema, payload) }
                        : fields[key];
            }

            if (out[key].type === "option" && typeof fields[key].options === "function") {
                out[key].options = await fields[key].options(payload);
            }

            if (out[key].disabled && typeof out[key].disabled === "function") {
                out[key].disabled = await out[key].disabled(payload);
            }
        }
        return out;
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
                "Missing builder-type '" + (req.body && req.body.__builder_type ? req.body.__builder_type : req.__builder_type) + "' ..."
            );
        }
        return type;
    }

    async validateFields(fields: any, data: any, errors?: any, path?: string) {
        if (!errors) {
            errors = {};
        }

        if (!fields || typeof fields !== "object") {
            return errors;
        }

        for (let key in fields) {
            const fieldPath = (path ? path + "." : "") + key;
            const value = lodash.get(data, fieldPath);
            if (fields[key].required) {
                let check = true;
                if (typeof fields[key].required === "function") {
                    check = await fields[key].required(data);
                }

                if (check) {
                    if (
                        value === null ||
                        value === false ||
                        value === undefined ||
                        (Array.isArray(value) && value.length < 1) ||
                        (!Array.isArray(value) && value.toString().trim() === "")
                    ) {
                        errors[fieldPath] = "Dieses Feld muss ausgefüllt werden.";
                        continue;
                    }
                }
            }

            if (typeof fields[key].schema === "object") {
                if (value && value.length > 0) {
                    for (let i in value) {
                        const entryPath = fieldPath + "[" + i + "]";
                        errors = await this.validateFields(fields[key].schema, data, errors, entryPath);
                    }
                }
            }

            if (fields[key].validation && fields[key].validation.trim() !== "") {
                // @ToDo
            }
        }

        return errors;
    }

    async typeForFrontend(type: any, req: any) {
        const newData: any = {};
        for (let key in type) {
            if (key === "forms") {
                newData.forms = {};
                if (typeof type.forms === "function") {
                    newData.forms = await type.forms(req);
                }

                for (let form in type.forms) {
                    if (!type.forms[form] || !type.forms[form].fields || type.forms[form].fields.length < 1) {
                        continue;
                    }

                    newData.forms[form] = {};

                    if (typeof type.forms[form].pageActions === "function") {
                        newData.forms[form].pageActions = await type.forms[form].pageActions(req);
                    } else if (type.forms[form].pageActions) {
                        newData.forms[form].pageActions = JSON.parse(JSON.stringify(type.forms[form].pageActions));
                    }

                    if (typeof type.forms[form].backLink === "function") {
                        newData.forms[form].backLink = await type.forms[form].backLink(req);
                    }

                    if (typeof type.forms[form].fields === "function") {
                        newData.forms[form].fields = await type.forms[form].fields(req);
                    } else if (type.forms[form].fields) {
                        newData.forms[form].fields = JSON.parse(JSON.stringify(type.forms[form].fields));
                    }
                }
            } else {
                newData[key] = type[key];
            }
        }
        return newData;
    }

    async loadType(req: Request) {
        const type: any = this.getTypeFromRequest(req);

        const data = {
            ...(await this.typeForFrontend(type, req)),
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
                        type.schema
                            ? typeof type.schema.fields === "function"
                                ? await type.schema.fields(req)
                                : type.schema.fields
                            : typeof type.fields === "function"
                            ? await type.fields(req)
                            : type.fields,
                        req
                    ),
                },
            },
        };
    }

    async applyFields(fields: any, element: any, data: any, payload: any, path?: string) {
        if (typeof fields !== "object" || !fields) {
            return element;
        }

        for (let key in fields) {
            if (!fields[key] || fields[key].unmapped) {
                continue;
            }

            const fieldPath = (path ? path + "." : "") + key;
            const value = lodash.get(data, fieldPath);
            const customType = this.getFieldType(fields[key].type);

            if (typeof fields[key].schema === "object" && fields[key].type === "array") {
                lodash.set(element, fieldPath, []);
                if (value && value.length > 0) {
                    for (let i in value) {
                        const entryPath = fieldPath + "[" + i + "]";
                        this.applyFields(fields[key].schema, element, data, payload, entryPath);
                    }
                }

                if (customType && typeof customType.onSave === "function") {
                    lodash.set(
                        element,
                        fieldPath,
                        await customType.onSave(lodash.get(element, fieldPath), { ...payload, ...fields[key].payload })
                    );
                }
            } else {
                let elementVal = null;
                if (
                    value !== undefined &&
                    value !== null &&
                    !(typeof value === "string" && value.trim() === "") &&
                    !(typeof value === "number" && value.toString().trim() === "")
                ) {
                    // Custom field onSave
                    if (customType && typeof customType.onSave === "function") {
                        elementVal = await customType.onSave(value, { ...payload, ...fields[key].payload });
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

                lodash.set(element, fieldPath, elementVal);
                // lodash.set(
                //     element,
                //     fieldPath,
                //     value === undefined || value === null || (typeof value === "string" && value.trim() === "")
                //         ? null
                //         : customType && typeof customType.onSave === "function"
                //         ? await customType.onSave(value, { ...payload, ...fields[key].payload })
                //         : fields[key].type === "currency" || fields[key].type === "float"
                //         ? parseFloat(value.toString().replace(",", "."))
                //         : fields[key].type === "integer"
                //         ? parseInt(value)
                //         : value
                // );
            }
        }

        return element;
    }

    async getAggregation(type: any, req: Request) {
        return [
            {
                $match: {
                    [type.schema.primaryKey ? type.schema.primaryKey : "_id"]: type.schema.primaryKeyPlain
                        ? req.body.__builder_id
                        : await Model.objectId(req.body.__builder_id),
                },
            },
        ];
    }

    async save(db: any, req: any) {
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

        const schemaFields = typeof type.schema.fields === "function" ? await type.schema.fields(req) : type.schema.fields;
        const errors: any = await this.validateFields(schemaFields, req.body.data);
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

        let element: any = null;
        let updateId: any = null;
        if (req.body.__builder_id === "new") {
            element = {};
            if (type.schema.primaryKey && type.schema.primaryKey.trim() !== "" && type.schema.primaryKey !== "_id") {
                element[type.schema.primaryKey] = type.schema.primaryKeyPlain
                    ? req.body.__builder_id
                    : await Model.objectId(req.body.builder_id);
            }

            element.__builder = {
                created_at: new Date(),
            };
        } else {
            const result = await db
                .collection(collection)
                .aggregate(
                    type.schema && typeof type.schema.getAggregation === "function"
                        ? await type.schema.getAggregation(await this.getAggregation(type, req), req)
                        : await this.getAggregation(type, req),
                    collection
                )
                .toArray();

            if (!result || !result[0] || !result[0][type.schema.primaryKey ? type.schema.primaryKey : "_id"]) {
                throw new Error("Element '" + req.body.__builder_id + "' not found ...");
            }
            element = result[0];
            updateId = result[0][type.schema.primaryKey ? type.schema.primaryKey : "_id"];
        }

        element = await this.applyFields(schemaFields, element, req.body.data, req.body.payload);
        if (!element.__builder) {
            element.__builder = {};
        }
        element.__builder.version = type.schema.version;
        element.__builder.collection = type.schema.collection;
        element.__builder.updated_at = new Date();

        try {
            if (typeof type.schema.beforeSave === "function") {
                await type.schema.beforeSave(element, req);
            }
        } catch (e: any) {
            throw e;
        }

        let changedId: any = null;
        if (updateId) {
            delete element[type.schema.primaryKey ? type.schema.primaryKey : "_id"];

            const status = await db.collection(collection).updateOne(
                {
                    _id: type.schema.primaryKeyPlain ? updateId.toString() : await Model.objectId(updateId),
                },
                { $set: { ...element } }
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

        try {
            if (typeof type.schema.afterSave === "function") {
                await type.schema.afterSave(element, req);
            }
        } catch (e: any) {
            throw e;
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

    async getField(req: Request, type: DataBuilderType, path: string) {
        if (!path || path.trim() === "") {
            return null;
        }

        const schemaFields = typeof type.schema.fields === "function" ? await type.schema.fields(req) : type.schema.fields;
        const field = lodash.get(schemaFields, this.removeArrayIndicators(path));
        return field && field.type ? field : null;
    }

    removeArrayIndicators(str: string) {
        return str.replace(/\[\d+\]/g, ".schema");
    }

    async details(db: any, req: any) {
        if (!req.body.__builder_id || req.body.__builder_id.toString().trim() === "") {
            throw new Error("Missing id ...");
        }

        const type = this.getTypeFromRequest(req);
        if (!type || !type.schema || !type.schema.fields) {
            throw new Error("Missing schema fields ...");
        }

        const collection = type.schema && type.schema.collection ? type.schema.collection : undefined;
        let element: any = null;
        try {
            element = await db
                .collection(collection)
                .aggregate(
                    type.schema && typeof type.schema.getAggregation === "function"
                        ? await type.schema.getAggregation(await this.getAggregation(type, req), req)
                        : await this.getAggregation(type, req),
                    collection
                )
                .toArray();
        } catch (e: any) {
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
    }

    async detailsNewData(db: any, req: any) {
        const type = this.getTypeFromRequest(req);
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
            data: data,
        };
    }

    async apiAutoComplete(req: any) {
        const type = this.getTypeFromRequest(req);
        const field = req.body.__builder_field ? await this.getField(req, type, req.body.__builder_field) : null;
        if (!field) {
            throw new Error("Invalid autocomplete field ...");
        }

        const fieldType = this.getFieldType(field.type);
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
