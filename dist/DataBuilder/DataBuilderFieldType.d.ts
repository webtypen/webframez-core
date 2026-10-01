import type { Request } from "../Router/Request";
import type { DataBuilderFieldOptions, DataBuilderFields } from "./DataBuilderTypes";
export type DataBuilderValidationContext = {
    field: DataBuilderFieldOptions;
    path: string;
    data: any;
    payload: any;
    request?: Request;
    structured: boolean;
};
/** Conversion-only capabilities are deliberately absent from validation contexts. */
export type DataBuilderFieldContext = DataBuilderValidationContext & {
    currentValue?: any;
    objectId: (value?: any) => Promise<any>;
    applyChildren: (fields: DataBuilderFields, target: any, path: string) => Promise<any>;
};
export type LegacyDataBuilderFieldType = {
    key?: string;
    type?: string;
    onSave?: (value: any, payload?: any) => any;
    onSearch?: (query: string, request: Request) => any;
    [key: string]: any;
};
/** Base for project field types. Missing/empty values are handled before conversion. */
export declare const DataBuilderFieldType: {
    new (): {
        key: string;
        type: string;
        onSave?: ((value: any, payload?: any) => any) | undefined;
        onSearch?: ((query: string, request: Request) => any) | undefined;
        isMissing(value: any): boolean;
        missingValue(_context: DataBuilderFieldContext): any;
        convert(value: any, _context: DataBuilderFieldContext): any;
        validationValue(value: any, _context: DataBuilderValidationContext): any;
        save(value: any, context: DataBuilderFieldContext): Promise<any>;
        validate(value: any, context: DataBuilderValidationContext): Promise<string | null>;
    };
};
/** Historical v1 object contract. The value of the same name is the extensible field constructor. */
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
/** Instance contract for the new class API; v1 object annotations remain unchanged. */
export type DataBuilderFieldTypeInstance = InstanceType<typeof DataBuilderFieldType>;
