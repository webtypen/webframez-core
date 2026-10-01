import { DBConnection } from "../Database/DBConnection";
import type { Request } from "../Router/Request";
import type { Response } from "../Router/Response";
import { DataBuilder, DataBuilderType } from "./DataBuilder";
import { DataBuilderFieldType, DataBuilderFieldTypeInstance, LegacyDataBuilderFieldType } from "./DataBuilderFieldType";
import { DataBuilderValidationType } from "./DataBuilderValidationType";

type FieldRegistration = DataBuilderFieldType | DataBuilderFieldTypeInstance | (new () => DataBuilderFieldTypeInstance);

type ValidationRegistration = DataBuilderValidationType | (new () => DataBuilderValidationType);

export type DataBuilderRouteOptions = {
    models?: Record<string, any>;
    types?: DataBuilderType[];
    fieldTypes?: FieldRegistration[] | Record<string, FieldRegistration | LegacyDataBuilderFieldType>;
    validationTypes?: ValidationRegistration[];
    connection?: string;
    configure?: (builder: DataBuilder, request: Request) => void | Promise<void>;
    middleware?: string[];
    domains?: string[];
};

/** Shared v1 wire protocol for the router helper and existing controllers. */
export async function serveDataBuilder(builder: DataBuilder, req: Request, res: Response, connection?: string) {
    switch (req.body?.__builder_rest_api) {
        case "type":
            return res.send(await builder.loadType(req));
        case "api-autocomplete":
            return res.send(await builder.apiAutoComplete(req));
        case "details":
            return res.send(await builder.details(await DBConnection.getDocumentStore(connection), req));
        case "details-newdata":
            return res.send(await builder.detailsNewData(await DBConnection.getDocumentStore(connection), req));
        case "save":
            return res.send(await builder.save(await DBConnection.getDocumentStore(connection), req));
        case "delete":
            return res.send(await builder.delete(await DBConnection.getDocumentStore(connection), req));
        default:
            return res.status(404).send({ status: "error", message: "Api-Endpoint not found ..." });
    }
}

export function dataBuilderRoute(options: DataBuilderRouteOptions = {}) {
    return async (req: Request, res: Response) => {
        const builder = new DataBuilder(options.connection);
        if (Array.isArray(options.fieldTypes)) {
            for (const field of options.fieldTypes) builder.registerFieldType(field);
        } else {
            for (const [key, field] of Object.entries(options.fieldTypes || {})) {
                builder.registerFieldType(key, typeof field === "function" ? new field() : field);
            }
        }
        for (const rule of options.validationTypes || []) builder.registerValidationType(rule);
        for (const [key, model] of Object.entries(options.models || {})) builder.registerModelType(key, model);
        for (const type of options.types || []) builder.registerType(type);
        if (options.configure) await options.configure(builder, req);
        return serveDataBuilder(builder, req, res, options.connection);
    };
}
