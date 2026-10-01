import type { Request } from "../Router/Request";
import type { DataBuilderFields } from "./DataBuilderTypes";
export declare function fieldsForFrontend(fields: DataBuilderFields, payload?: any, childrenForFrontend?: (fields: DataBuilderFields, payload?: any) => Promise<DataBuilderFields>): Promise<DataBuilderFields>;
export declare function typeForFrontend(type: any, req: Request, structured?: boolean): Promise<any>;
