import { DataBuilderFieldType } from "./DataBuilderFieldType";
import type {
    DataBuilderFieldContext,
    DataBuilderValidationContext,
    LegacyDataBuilderFieldType,
    DataBuilderFieldTypeInstance,
} from "./DataBuilderFieldType";

/** All v1 custom-field precedence rules live at this adapter boundary. */
export class LegacyFieldTypeAdapter extends DataBuilderFieldType {
    constructor(
        key: string,
        private readonly definition: LegacyDataBuilderFieldType,
        private readonly standard?: DataBuilderFieldTypeInstance,
    ) {
        super();
        this.key = key;
        this.type = definition.type || "custom";
        if (definition.onSave) this.onSave = definition.onSave.bind(definition);
        if (definition.onSearch) this.onSearch = definition.onSearch.bind(definition);
    }

    convert(value: any, context: DataBuilderFieldContext) {
        return this.onSave ? this.onSave(value, context.payload) : value;
    }

    validationValue(value: any, context: DataBuilderValidationContext) {
        return !this.onSave && this.standard ? this.standard.validationValue(value, context) : value;
    }

    async save(value: any, context: DataBuilderFieldContext): Promise<any> {
        // v1 always applies ObjectId conversion, even if a custom handler is registered.
        if (this.standard && (this.key === "ObjectId" || !this.onSave)) {
            return this.standard.save(value, context);
        }
        if (this.key === "array" && context.field.schema && this.standard) {
            const children = await this.standard.convert(value, context);
            return this.convert(children, context);
        }
        return super.save(value, context);
    }
}
