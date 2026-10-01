import { NumericFieldType } from "./NumericFieldType";
export declare class FloatFieldType extends NumericFieldType {
    key: string;
    type: string;
    protected legacyValue(value: any): number;
}
