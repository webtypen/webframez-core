import { DataBuilderValidationType } from "../DataBuilderValidationType";

export class MaxValidationType extends DataBuilderValidationType {
    key = "max";

    validate(value: any, parameters: any[]) {
        const [max] = parameters;
        if (typeof max !== "number" || !Number.isFinite(max)) throw new Error("max requires a finite number.");
        const size = this.size(value);
        return typeof size === "number" && Number.isFinite(size) && size <= max ? null : `Der Wert darf höchstens ${max} betragen.`;
    }
}
