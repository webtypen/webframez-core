import { DataBuilderFieldType, DataBuilderFieldContext } from "../DataBuilderFieldType";
export declare class ObjectIdFieldType extends DataBuilderFieldType {
    key: string;
    type: string;
    isMissing(value: any): boolean;
    missingValue(context: DataBuilderFieldContext): Promise<any>;
    convert(value: any, context: DataBuilderFieldContext): Promise<any>;
}
