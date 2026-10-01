import { DataBuilderFieldType, DataBuilderFieldContext, DataBuilderValidationContext } from "../DataBuilderFieldType";
export declare class ArrayFieldType extends DataBuilderFieldType {
    key: string;
    type: string;
    missingValue(context: DataBuilderFieldContext): never[] | null;
    validate(value: any, context: DataBuilderValidationContext): Promise<string | null>;
    convert(value: any, context: DataBuilderFieldContext): Promise<any>;
}
