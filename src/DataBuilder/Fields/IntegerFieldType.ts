import { NumericFieldType } from "./NumericFieldType";

export class IntegerFieldType extends NumericFieldType {
    key = "integer";
    type = "integer";
    protected error = "Bitte eine ganze Zahl angeben.";

    protected accepts(value: number) {
        return Number.isInteger(value);
    }

    protected legacyValue(value: any) {
        return parseInt(value);
    }
}
