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
export declare function serveDataBuilder(builder: DataBuilder, req: Request, res: Response, connection?: string): Promise<Response>;
export declare function dataBuilderRoute(options?: DataBuilderRouteOptions): (req: Request, res: Response) => Promise<Response>;
export {};
