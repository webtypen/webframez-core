import { Request } from "../Router/Request";
export type DataBuilderSchema = {
    version: string;
    collection?: string;
    primaryKey?: string;
    primaryKeyPlain?: boolean;
    beforeSave?: any;
    afterSave?: any;
    getAggregation?: any;
    events?: {
        [key: string]: any;
    };
    fields: {
        [key: string]: any;
    };
};
export type DataBuilderType = {
    key: string;
    singular: string;
    plural: string;
    schema: DataBuilderSchema;
    forms?: {
        [key: string]: any;
    };
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
    validateFields(fields: any, data: any, errors?: any, path?: string): Promise<any>;
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
        data: {
            _id: any;
            redirect: any;
        };
        errors?: undefined;
    }>;
    getField(req: Request, type: DataBuilderType, path: string): Promise<any>;
    removeArrayIndicators(str: string): string;
    details(db: any, req: any): Promise<{
        status: string;
        data: any;
    }>;
    apiAutoComplete(req: any): Promise<{
        status: string;
        data: void;
    }>;
}
