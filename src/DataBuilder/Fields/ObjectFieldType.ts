import { DataBuilderFieldType, DataBuilderFieldContext, DataBuilderValidationContext } from "../DataBuilderFieldType";

export class ObjectFieldType extends DataBuilderFieldType {
    key = "object";
    type = "object";

    missingValue(context: DataBuilderFieldContext): any {
        return context.structured && context.field.schema ? this.convert({}, context) : null;
    }

    async validate(value: any, context: DataBuilderValidationContext) {
        const error = await super.validate(value, context);
        if (error) return error;
        return context.structured && !this.isMissing(value) && (typeof value !== "object" || Array.isArray(value))
            ? "Bitte ein Objekt angeben."
            : null;
    }

    async convert(value: any, context: DataBuilderFieldContext) {
        if (context.structured && context.field.schema) {
            return context.applyChildren(context.field.schema, { ...(context.currentValue || {}) }, context.path);
        }
        return value;
    }
}
