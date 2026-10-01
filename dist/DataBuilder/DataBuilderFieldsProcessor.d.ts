import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import type { Request } from "../Router/Request";
import { DataBuilderFieldType, DataBuilderFieldTypeInstance } from "./DataBuilderFieldType";
import { DataBuilderValidationType } from "./DataBuilderValidationType";
import type { DataBuilderType, DataBuilderFields, DataBuilderErrors } from "./DataBuilderTypes";
/** Calls back through the builder so v1 subclass overrides remain virtual, including recursion. */
export type DataBuilderFieldHooks = {
    getFieldType(key: string): DataBuilderFieldType | null;
    handleUnique(db: DocumentDatabase, req: Request, key: string, value: any, field: any, type: DataBuilderType): Promise<boolean>;
    validateFields(db: DocumentDatabase, type: DataBuilderType, fields: DataBuilderFields, req: Request, errors?: DataBuilderErrors, path?: string, structured?: boolean): Promise<DataBuilderErrors>;
    applyFields(fields: DataBuilderFields, element: any, data: any, payload: any, path?: string, structured?: boolean, request?: Request): Promise<any>;
    removeArrayIndicators(path: string): string;
};
/** Field registry and recursive validation/conversion; no form selection or record persistence. */
export declare class DataBuilderFieldsProcessor {
    private readonly connection?;
    private readonly hooks;
    constructor(connection?: string | undefined, hooks?: DataBuilderFieldHooks);
    private fieldTypes;
    private standardFields;
    private validations;
    registerValidationType(rule: DataBuilderValidationType | (new () => DataBuilderValidationType)): this;
    registerFieldType(key: string | DataBuilderFieldType | DataBuilderFieldTypeInstance | (new () => DataBuilderFieldTypeInstance), options?: any): this;
    /** The v1 lookup returns only explicitly registered object definitions. */
    getFieldType(key: string): DataBuilderFieldType | null;
    /** Resolve a class instance, including adapters for v1 registrations and overrides. */
    getFieldTypeInstance(key: string): DataBuilderFieldTypeInstance | null;
    private processingType;
    getFieldTypesFrontend(): any;
    validateFields(db: DocumentDatabase, type: DataBuilderType, fields: DataBuilderFields, req: Request, errors?: DataBuilderErrors, path?: string, structured?: boolean): Promise<DataBuilderErrors>;
    handleUnique(db: DocumentDatabase, req: any, key: string, value: any, field: any, type: any): Promise<boolean>;
    private validationContext;
    applyFields(fields: DataBuilderFields, element: any, data: any, payload: any, path?: string, structured?: boolean, request?: Request): Promise<any>;
    getField(req: Request, type: DataBuilderType, path: string): Promise<any>;
    removeArrayIndicators(str: string): string;
}
