import { DataBuilderFieldType } from "../DataBuilderFieldType";
import type { DataBuilderValidationContext } from "../DataBuilderFieldType";
/** Shared decimal parsing for numeric fields. Legacy conversion remains explicit in each subtype. */
export declare abstract class NumericFieldType extends DataBuilderFieldType {
    protected error: string;
    protected parse(value: unknown): number;
    protected accepts(value: number): boolean;
    protected abstract legacyValue(value: any): number;
    convert(value: any, context?: DataBuilderValidationContext): number;
    validationValue(value: any, context: DataBuilderValidationContext): number;
    validate(value: any, context: DataBuilderValidationContext): Promise<string | null>;
}
