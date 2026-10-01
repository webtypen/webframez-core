import { NumericFieldType } from "./NumericFieldType";

export class FloatFieldType extends NumericFieldType {
    key = "float";
    type = "float";

    protected legacyValue(value: any) {
        return parseFloat(value.toString().replace(",", "."));
    }
}
