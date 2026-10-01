import { DataBuilderFieldType, DataBuilderFieldContext, DataBuilderValidationContext } from "../DataBuilderFieldType";

export class ArrayFieldType extends DataBuilderFieldType {
    key = "array";
    type = "array";

    missingValue(context: DataBuilderFieldContext) {
        return context.structured || context.field.schema ? [] : null;
    }

    async validate(value: any, context: DataBuilderValidationContext) {
        const error = await super.validate(value, context);
        if (error) return error;
        if (context.structured && !this.isMissing(value)) {
            if (!Array.isArray(value)) return "Bitte eine Liste angeben.";
            if (context.field.schema && value.some((item) => !item || typeof item !== "object" || Array.isArray(item)))
                return "Die Listeneinträge müssen Objekte sein.";
        }
        return null;
    }

    async convert(value: any, context: DataBuilderFieldContext) {
        if (!context.field.schema || typeof context.field.schema !== "object") return value;
        const result: any[] = [];
        for (let index = 0; index < (value?.length || 0); index++) {
            const target =
                context.structured && context.currentValue?.[index] && typeof context.currentValue[index] === "object"
                    ? { ...context.currentValue[index] }
                    : {};
            result.push(await context.applyChildren(context.field.schema, target, `${context.path}[${index}]`));
        }
        return result;
    }
}
