import { DataBuilderFieldType } from "./DataBuilderFieldType";
import type { DataBuilderFieldContext, DataBuilderValidationContext, LegacyDataBuilderFieldType } from "./DataBuilderFieldType";
/** All v1 custom-field precedence rules live at this adapter boundary. */
export declare class LegacyFieldTypeAdapter extends DataBuilderFieldType {
    private readonly definition;
    private readonly standard?;
    constructor(key: string, definition: LegacyDataBuilderFieldType, standard?: {
        key: string;
        type: string;
        onSave?: ((value: any, payload?: any) => any) | undefined;
        onSearch?: ((query: string, request: import("..").Request) => any) | undefined;
        isMissing(value: any): boolean;
        missingValue(_context: DataBuilderFieldContext): any;
        convert(value: any, _context: DataBuilderFieldContext): any;
        validationValue(value: any, _context: DataBuilderValidationContext): any;
        save(value: any, context: DataBuilderFieldContext): Promise<any>;
        validate(value: any, context: DataBuilderValidationContext): Promise<string | null>;
    } | undefined);
    convert(value: any, context: DataBuilderFieldContext): any;
    validationValue(value: any, context: DataBuilderValidationContext): any;
    save(value: any, context: DataBuilderFieldContext): Promise<any>;
}
