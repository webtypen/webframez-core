import { Request } from "../Router/Request";
export type DataBuilderSchema = {
    version: string;
    collection?: string;
    primaryKey?: string;
    primaryKeyPlain?: boolean;
    beforeSave?: any;
    afterSave?: any;
    beforeDelete?: any;
    afterDelete?: any;
    getAggregation?: any;
    events?: {
        [key: string]: any;
    };
    fields: {
        [key: string]: any;
    };
    newDataHandler?: Function;
    canDelete?: any;
};
export type DataBuilderType = {
    key: string;
    singular: string;
    plural: string;
    schema: DataBuilderSchema;
    forms?: {
        [key: string]: any;
    };
    unmapped?: boolean;
};
export type DataBuilderFieldType = {
    key: string;
    type: "api-autocomplete";
    onSave: (value: any, payload?: any) => void;
    onSearch: (query: string, req: Request) => void;
} | {
    key: string;
    type: "object";
    onSave: (value: any, payload?: any) => void;
    onSearch?: never;
};
export declare class DataBuilder {
    private types;
    private fieldTypes;
    getType(key: string): DataBuilderType | null;
    registerType(typeObj: DataBuilderType): this;
    registerFieldType(key: string, options?: any): this;
    registerModelType(key: string, model: any): this;
    getFieldType(key: string): DataBuilderFieldType | null;
    getFieldTypesFrontend(): any;
    getFieldsFrontend(fields: any, payload?: any): Promise<any>;
    getTypeFromRequest(req: any): DataBuilderType;
    validateFields(db: any, type: any, fields: any, req: Request, errors?: any, path?: string): Promise<any>;
    handleUnique(db: any, req: any, key: string, value: any, field: any, type: any): Promise<boolean>;
    typeForFrontend(type: any, req: any): Promise<any>;
    loadType(req: Request): Promise<{
        status: string;
        data: any;
    }>;
    applyFields(fields: any, element: any, data: any, payload: any, path?: string): Promise<any>;
    getAggregation(type: any, req: Request): Promise<{
        $match: {
            [x: number]: any;
        };
    }[]>;
    save(db: any, req: any): Promise<{
        status: string;
        errors: any;
        data?: undefined;
    } | {
        status: string;
        data: any;
        errors?: undefined;
    }>;
    delete(db: any, req: any): Promise<{
        status: string;
        data: {
            _id: any;
            redirect: any;
        };
    }>;
    getField(req: Request, type: DataBuilderType, path: string): Promise<any>;
    removeArrayIndicators(str: string): string;
    details(db: any, req: any): Promise<{
        status: string;
        data: any;
    }>;
    detailsNewData(db: any, req: any): Promise<{
        status: string;
        message: string;
        data?: undefined;
    } | {
        status: string;
        data: any;
        message?: undefined;
    }>;
    apiAutoComplete(req: any): Promise<{
        status: string;
        data: void;
    }>;
}
