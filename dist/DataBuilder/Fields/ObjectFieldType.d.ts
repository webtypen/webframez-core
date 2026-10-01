import { DataBuilderFieldType, DataBuilderFieldContext, DataBuilderValidationContext } from "../DataBuilderFieldType";
export declare class ObjectFieldType extends DataBuilderFieldType {
    key: string;
    type: string;
    missingValue(context: DataBuilderFieldContext): any;
    validate(value: any, context: DataBuilderValidationContext): Promise<string | null>;
    convert(value: any, context: DataBuilderFieldContext): Promise<any>;
}
