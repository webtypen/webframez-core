import { DataBuilderValidationType } from "../DataBuilderValidationType";

export class LengthValidationType extends DataBuilderValidationType {
    key = "length";

    validate(value: any, parameters: any[]) {
        const [min, max] = parameters;
        if (!Number.isInteger(min) || min < 0 || (max !== undefined && (!Number.isInteger(max) || max < min)))
            throw new Error("length requires a minimum length and optional maximum length.");
        const size = this.length(value);
        return size >= min && (max === undefined || size <= max)
            ? null
            : `Die Länge muss mindestens ${min}${max === undefined ? "" : ` und höchstens ${max}`} betragen.`;
    }
}
