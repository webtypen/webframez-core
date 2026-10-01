import { DataBuilderFieldType } from "../DataBuilderFieldType";
import type { DataBuilderValidationContext } from "../DataBuilderFieldType";

/** Shared decimal parsing for numeric fields. Legacy conversion remains explicit in each subtype. */
export abstract class NumericFieldType extends DataBuilderFieldType {
    protected error = "Bitte eine gültige Zahl angeben.";

    protected parse(value: unknown): number {
        if (typeof value === "number") return value;
        if (typeof value !== "string") return NaN;
        const decimal = value.trim().replace(",", ".");
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(decimal)) return NaN;
        return Number(decimal);
    }

    protected accepts(value: number) {
        return Number.isFinite(value);
    }

    protected abstract legacyValue(value: any): number;

    convert(value: any, context?: DataBuilderValidationContext) {
        return context?.structured ? this.parse(value) : this.legacyValue(value);
    }

    validationValue(value: any, context: DataBuilderValidationContext) {
        return this.convert(value, context);
    }

    async validate(value: any, context: DataBuilderValidationContext) {
        const requiredError = await super.validate(value, context);
        if (requiredError) return requiredError;
        if (context.structured && !this.isMissing(value) && !this.accepts(this.parse(value))) return this.error;
        return null;
    }
}
