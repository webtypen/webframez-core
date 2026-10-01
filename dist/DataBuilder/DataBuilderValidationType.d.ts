import type { DataBuilderValidationContext } from "./DataBuilderFieldType";
export type DataBuilderValidationRule = string | [string, ...any[]];
/** Return null on success or the v1 error text for this field. */
export declare abstract class DataBuilderValidationType {
    abstract key: string;
    protected length(value: unknown): number;
    protected size(value: unknown): number;
    abstract validate(value: any, parameters: any[], context: DataBuilderValidationContext): string | null | Promise<string | null>;
}
export declare function validationArguments(rule: DataBuilderValidationRule): [string, any[]];
