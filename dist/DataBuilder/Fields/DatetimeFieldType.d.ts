import { DataBuilderFieldType } from "../DataBuilderFieldType";
export declare class DatetimeFieldType extends DataBuilderFieldType {
    key: string;
    type: string;
    convert(value: any): string | null;
}
