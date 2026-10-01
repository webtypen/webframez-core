import {
    DataBuilder,
    DataBuilderFieldType,
    DataBuilderFieldTypeInstance,
    DataBuilderFieldContext,
    DataBuilderValidationContext,
    DataBuilderFields,
    DataBuilderType,
    DataBuilderErrors,
    DocumentDatabase,
    Request,
    Route,
} from "../dist";
import { DataBuilderFieldType as PreviousModuleExport } from "../dist/DataBuilder/DataBuilder";

// Both historical object variants, and discriminated-union consumers, remain valid.
const objectField: DataBuilderFieldType = {
    key: "old-object",
    type: "object",
    onSave: (value) => value,
};
const lookupField: DataBuilderFieldType = {
    key: "old-lookup",
    type: "api-autocomplete",
    onSave: (value) => value,
    onSearch: async (query) => [{ value: query }],
};
const samePreviousExport: PreviousModuleExport = objectField;

function consumeLegacy(field: DataBuilderFieldType, req: Request) {
    field.onSave("value", {});
    if (field.type === "api-autocomplete") field.onSearch("query", req);
}

// The same name in value position remains the constructor for new field classes.
class CodeField extends DataBuilderFieldType {
    key = "code";

    override missingValue(_context: DataBuilderFieldContext) {
        return "DEFAULT";
    }

    override convert(value: any, _context: DataBuilderFieldContext) {
        return String(value).trim();
    }

    override async validate(value: any, context: DataBuilderValidationContext) {
        return super.validate(value, context);
    }
}

const instance: DataBuilderFieldTypeInstance = new CodeField();
const constructor: typeof DataBuilderFieldType = CodeField;

class ProjectBuilder extends DataBuilder {
    override getFieldType(key: string): DataBuilderFieldType | null {
        return key === "old-lookup" ? lookupField : super.getFieldType(key);
    }

    override async handleUnique(db: DocumentDatabase, req: Request, key: string, value: any, field: any, type: DataBuilderType) {
        return super.handleUnique(db, req, key, value, field, type);
    }

    override async validateFields(
        db: DocumentDatabase,
        type: DataBuilderType,
        fields: DataBuilderFields,
        req: Request,
        errors?: DataBuilderErrors,
        path?: string,
    ) {
        return super.validateFields(db, type, fields, req, errors, path);
    }
}

const builder = new ProjectBuilder();
builder.registerFieldType("old-object", objectField);
builder.registerFieldType("old-lookup", lookupField);
builder.registerFieldType(instance);
builder.registerFieldType(CodeField);
Route.databuilder("/old-fields", { fieldTypes: { object: objectField, lookup: lookupField } });
Route.databuilder("/new-fields", { fieldTypes: [CodeField, instance] });
void [samePreviousExport, consumeLegacy, constructor];

// Unchanged v1 assignments and inferred narrowing must also work on the base class.
const baseBuilder = new DataBuilder().registerFieldType("old-lookup", lookupField);
const registeredLegacy: DataBuilderFieldType | null = baseBuilder.getFieldType("old-lookup");
const previousExport: PreviousModuleExport | null = baseBuilder.getFieldType("old-object");
const inferredLegacy = baseBuilder.getFieldType("old-lookup");
if (inferredLegacy) {
    inferredLegacy.onSave("value", {});
    if (inferredLegacy.type === "api-autocomplete") inferredLegacy.onSearch("query", new Request());
}
const registeredInstance: DataBuilderFieldTypeInstance | null = baseBuilder.registerFieldType(CodeField).getFieldTypeInstance("code");
void [registeredLegacy, previousExport, registeredInstance];
