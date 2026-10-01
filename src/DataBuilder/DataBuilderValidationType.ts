import type { DataBuilderValidationContext } from "./DataBuilderFieldType";

export type DataBuilderValidationRule = string | [string, ...any[]];

/** Return null on success or the v1 error text for this field. */
export abstract class DataBuilderValidationType {
    abstract key: string;

    protected length(value: unknown): number {
        return typeof value === "string" ? Array.from(value).length : Array.isArray(value) ? value.length : NaN;
    }

    protected size(value: unknown): number {
        return typeof value === "number" ? value : this.length(value);
    }

    abstract validate(value: any, parameters: any[], context: DataBuilderValidationContext): string | null | Promise<string | null>;
}

export function validationArguments(rule: DataBuilderValidationRule): [string, any[]] {
    if (typeof rule === "string" && rule.length) return [rule, []];
    if (Array.isArray(rule) && typeof rule[0] === "string" && rule[0].length) return [rule[0], rule.slice(1)];
    throw new Error("Invalid DataBuilder validation rule.");
}
