import { DataBuilderFieldType, DataBuilderFieldContext } from "../DataBuilderFieldType";

export class ObjectIdFieldType extends DataBuilderFieldType {
    key = "ObjectId";
    type = "ObjectId";

    isMissing(value: any) {
        return value === undefined || value === null || value === "";
    }

    // v1 creates a new ID for an empty ObjectId field.
    missingValue(context: DataBuilderFieldContext) {
        return context.objectId();
    }

    convert(value: any, context: DataBuilderFieldContext) {
        return context.objectId(value);
    }
}
