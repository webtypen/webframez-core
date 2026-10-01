import { DataBuilderValidationType } from "../DataBuilderValidationType";

export class MinValidationType extends DataBuilderValidationType {
    key = "min";

    validate(value: any, parameters: any[]) {
        const [min] = parameters;
        if (typeof min !== "number" || !Number.isFinite(min)) throw new Error("min requires a finite number.");
        const size = this.size(value);
        return typeof size === "number" && Number.isFinite(size) && size >= min ? null : `Der Wert muss mindestens ${min} betragen.`;
    }
}
