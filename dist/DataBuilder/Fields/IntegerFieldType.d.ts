import { NumericFieldType } from "./NumericFieldType";
export declare class IntegerFieldType extends NumericFieldType {
    key: string;
    type: string;
    protected error: string;
    protected accepts(value: number): boolean;
    protected legacyValue(value: any): number;
}
