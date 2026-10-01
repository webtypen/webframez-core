import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import { Request } from "../Router/Request";
import { DataBuilderFieldType, DataBuilderFieldTypeInstance } from "./DataBuilderFieldType";
import { DataBuilderValidationType } from "./DataBuilderValidationType";
import type { DataBuilderType, DataBuilderFields, DataBuilderErrors } from "./DataBuilderTypes";
export * from "./DataBuilderTypes";
export { DataBuilderFieldType } from "./DataBuilderFieldType";
export declare class DataBuilder {
    private readonly connection?;
    private readonly forms;
    private readonly fields;
    constructor(connection?: string | undefined);
    private objectId;
    private resolveType;
    getType(key: string): DataBuilderType | null;
    registerType(type: DataBuilderType): this;
    registerModelType(key: string, model: any): this;
    registerFieldType(key: string | DataBuilderFieldType | DataBuilderFieldTypeInstance | (new () => DataBuilderFieldTypeInstance), options?: any): this;
    registerValidationType(rule: DataBuilderValidationType | (new () => DataBuilderValidationType)): this;
    getFieldType(key: string): DataBuilderFieldType | null;
    getFieldTypeInstance(key: string): DataBuilderFieldTypeInstance | null;
    getFieldTypesFrontend(): any;
    getFieldsFrontend(fields: DataBuilderFields, payload?: any): Promise<DataBuilderFields>;
    typeForFrontend(type: DataBuilderType, req: Request, structured?: boolean): Promise<any>;
    validateFields(db: DocumentDatabase, type: DataBuilderType, fields: DataBuilderFields, req: Request, errors?: DataBuilderErrors, path?: string, structured?: boolean): Promise<DataBuilderErrors>;
    handleUnique(db: DocumentDatabase, req: Request, key: string, value: any, field: any, type: DataBuilderType): Promise<boolean>;
    applyFields(fields: DataBuilderFields, element: any, data: any, payload: any, path?: string, structured?: boolean, request?: Request): Promise<any>;
    getField(req: Request, type: DataBuilderType, path: string): Promise<any>;
    removeArrayIndicators(path: string): string;
    getTypeFromRequest(req: any): DataBuilderType;
    loadType(req: Request): Promise<{
        status: string;
        data: any;
    }>;
    getAggregation(type: DataBuilderType, req: Request): Promise<{
        $match: {
            [x: string]: any;
        };
    }[]>;
    private loadElement;
    save(db: DocumentDatabase, req: Request): Promise<{
        status: string;
        errors: DataBuilderErrors;
        data?: undefined;
    } | {
        status: string;
        data: any;
        errors?: undefined;
    }>;
    delete(db: DocumentDatabase, req: Request): Promise<{
        status: string;
        data: {
            _id: any;
            redirect: any;
        };
    }>;
    details(db: DocumentDatabase, req: Request): Promise<{
        status: string;
        data: any;
    }>;
    detailsNewData(db: DocumentDatabase, req: Request): Promise<{
        status: string;
        message: string;
        data?: undefined;
    } | {
        status: string;
        data: any;
        message?: undefined;
    }>;
    apiAutoComplete(req: Request): Promise<{
        status: string;
        data: any;
    }>;
}
