# DataBuilder: Models, server-side forms and routes

`Route.databuilder()` registers a POST endpoint using the existing v1 protocol. The React DataBuilder provider and its request structure remain unchanged. Existing `DataBuilderController`, `registerType()`, `registerModelType()`, `__schema`, `__forms` and `registerFieldType(key, { onSave, onSearch })` remain supported.

## Model metadata

```ts
import { Model, Field, Validates, Forms } from "@webtypen/webframez-core";

@Forms(() => [UserProfileForm, UserSettingsForm])
class User extends Model {
    __table = "users";

    @Field({ required: true, label: "E-Mail" })
    @Validates("email", ["length", 3], ["max", 30])
    declare email: string;

    @Field({ type: "boolean", label: "Aktiv" })
    declare enabled: boolean;

    @Field({ type: "array", schema: {
        city: { type: "string", required: true },
        street: { type: "string" },
    } })
    declare addresses: { city: string; street: string }[];
}
```

`declare` provides TypeScript types without creating instance values. Runtime field types come from `@Field({ type })`; omitted types default to `string`. No reflection metadata is required. Enable TypeScript's `experimentalDecorators` option. `@Validates()` also registers a field, so a string with only validation needs no separate `@Field()` unless further settings are needed.

Metadata is inherited without mutating parent definitions. Decorated definitions override corresponding legacy `__schema.fields` entries; validation decorators on subclasses append to inherited rules. Both decorator orders work. Nested schema entries accept the same `required` and `validations` options.

Without registered forms or legacy `__forms`, decorated models get a default form containing their fields, including child layouts. Existing `__schema` still carries version, collection, hooks, aggregation, uniqueness, new-data and deletion behavior. Defining `static forms = () => [UserProfileForm]` is an alternative to `@Forms()`; the decorator takes precedence.

## Server-side form classes

```ts
import { ModelForm } from "@webtypen/webframez-core";

class UserProfileForm extends ModelForm<User> {
    key = "profile";

    layout() {
        return [this.component("card", {
            title: "Profil",
            children: [
                this.field("email"),
                this.field("addresses", {
                    fields: [this.field("city"), this.field("street")],
                }),
            ],
        })];
    }

    options() {
        return { onSaveRedirect: () => "/users", allowDeletion: false };
    }
}

class UserSettingsForm extends ModelForm<User> {
    key = "settings";
    layout() { return [this.field("enabled")]; }
}
```

`component(name, settings)` produces the existing `{ type, ...settings }` descriptor. Component names and settings come from the frontend's central component registry, including project extensions. The core does not prescribe `card()`/`row()` helpers or create a second component registry. `field(name, settings)` binds a model field; nested layouts use `settings.fields`. Layouts support children, fields and tabs. In custom component slots, use nodes returned by `this.field()` or `this.component()`. These carry internal symbol metadata (preserved by object spread and omitted from JSON), so an unrelated setting such as `{ field: "sortColumn" }` is never treated as a model binding. Plain v1 field descriptors remain supported in the standard layout slots.

`layout(context)` and `options(context)` may be asynchronous. Context contains `request`, the model constructor, submitted `data` and the builder `id`. It does not automatically query the model; load records explicitly when a dynamic layout requires them. Each form is instantiated per request. Only serializable component options should be returned; redirects remain server-side callbacks.

Each form receives a builder key such as `users:profile` or `users:settings`. The root `users` selects the form named `main`, or otherwise the first registered form. Every selected form is returned as `forms.main`, matching the existing frontend. Pass the desired builder key to the existing frontend `type` prop; no new request property is needed. Form keys must be unique and use letters, numbers, `_` or `-`.

### Save scope

For these new forms, the selected field bindings determine which schema fields are read, validated and written. Details/new-data responses contain those fields (plus the record ID for details). Submitting an extra field produces the existing `{ status: "error", errors: { path: message } }` response. Omitted fields within the selected form are processed using their field type's missing-value behavior; this is a full-form save, not PATCH.

Nested objects preserve existing fields outside the selected child schema, including when a missing object clears the selected children. Array submission replaces the list; retained entries preserve unselected child values **by position**. This is the existing index-based binding model, not identity-based relation merging: for reorderable rows containing private/unselected values, provide project-specific persistence through the existing hooks/model logic. Deleting list entries removes the corresponding rows. To avoid ambiguity, give nested `this.field()` calls an explicit `fields` layout; without it, the nested schema is included in full.

This scope is not a new permission system. Continue using existing route middleware, aggregation restrictions, hooks and `canDelete`. `allowDeletion` controls frontend display; `canDelete` controls the server check. Do not derive access decisions from submitted `context.data` or payload. Existing v1 registrations retain their original scope and behavior.

## Central route configuration

```ts
Route.group({ prefix: "/api", middleware: ["auth"] }, () => {
    Route.databuilder("/databuilder", {
        models: { users: User },
        fieldTypes: [ProjectCodeField],
        validationTypes: [PrefixValidation],
        // connection: "main",
        // types: [existingDataBuilderType],
        // configure: async (builder, request) => { /* existing registrations */ },
    });
});
```

The route inherits group prefixes, domains and middleware, and accepts additional `middleware`/`domains`. Configure the same registered authorization middleware as for the old controller. `connection` selects persistence and ObjectId conversion. Classes passed in `fieldTypes` and `validationTypes` are instantiated per request; explicitly supplied instances should be stateless. Field registrations can also be an object keyed by custom type name, accepting class constructors, instances or v1 option objects. `configure` runs last and can replace registrations for a request.

The shared router/controller dispatcher retains these operations and body keys:

- `__builder_rest_api`: `type`, `details`, `details-newdata`, `save`, `delete`, `api-autocomplete`.
- `__builder_type`, `__builder_id`, `data`, `payload`; autocomplete additionally uses `__builder_field` and `query`.
- Existing success/error objects, `_id`, redirect and flat validation error paths.

Type metadata and autocomplete do not require opening a database connection automatically. Existing controller subclasses can remain in place during migration.

## Field and validation extensions

```ts
class ProjectCodeField extends DataBuilderFieldType {
    key = "project-code";
    type = "string"; // Existing frontend rendering type
    missingValue() { return "SB-"; }
    convert(value: any) { return String(value).trim(); }
}

class PrefixValidation extends DataBuilderValidationType {
    key = "prefix";
    validate(value: any, [prefix]: any[]) {
        if (typeof prefix !== "string") throw new Error("prefix requires a string");
        return typeof value === "string" && value.startsWith(prefix)
            ? null : `Der Wert muss mit ${prefix} beginnen.`;
    }
}
// @Field({ type: "project-code", required: true })
// @Validates(["prefix", "SB-"])
```

Field classes expose `isMissing`, `missingValue`, `convert`, `validate` and optional `onSearch`. Conversion, missing values and validation may be asynchronous. Validation receives `DataBuilderValidationContext`: field definition, full path, submitted data, merged payload, request and form mode. Conversion receives `DataBuilderFieldContext`, which additionally provides the current persisted value, the selected connection's `objectId()` and recursive `applyChildren()`. No placeholder conversion functions are exposed during validation. Call `super.validate()` when extending required behavior.

All built-in types now have separate classes: `string`, `boolean`, `integer`, `float`, `currency`, `ObjectId`, `array`, `object`, `date`, `datetime`, `time`, `daterange`, `option`, `model`, `password`, `secure`, `color`, `wysiwyg`, `custom`, `api-autocomplete`.

Missing values default to `null`. Schema-backed arrays default to `[]`; new form arrays also do so without a child schema. Empty ObjectId fields generate an ID as in v1. Structured objects apply missing values recursively to selected children. Built-ins preserve v1 conversion rules. New forms use one decimal parser for numeric type validation, parameterized limits and persistence: exponent notation such as `1e3` becomes `1000`, while hexadecimal/binary strings and partial values such as `12x` are rejected. Numeric project fields can extend `NumericFieldType`, `IntegerFieldType` or `FloatFieldType` and inherit the same behavior. New forms also reject invalid object/array input. Required retains the existing treatment of empty text, null/undefined, false checkboxes and empty arrays. Async nested conversions are now fully awaited.

Validation rules return `null` on success or a field error string. They receive `(value, parameters, context)` and may be asynchronous. Required/type validation runs first; additional rules skip missing optional values and receive the field type's `validationValue()`. By default this is the submitted value; numeric fields return the same numeric interpretation used for persistence. Custom conversion handlers are not invoked for validation. Unknown rule names fail explicitly. Legacy `validation` strings remain unchanged; new rules use `validations` arrays.

Built-in rules:

| Rule | Behavior |
| --- | --- |
| `"email"` | Basic email syntax; does not establish deliverability |
| `["length", min, max?]` | Minimum and optional maximum string/array length |
| `["min", value]` | Minimum numeric value or string/array length |
| `["max", value]` | Maximum numeric value or string/array length |

String length counts Unicode code points. Numeric schema fields accept numeric strings (including decimal comma) for min/max checks. Projects can register additional rules or replace a standard key centrally.

A complete, type-checked example is in `test-support/databuilder-example.ts`. Tests cover legacy protocol/conversions, inheritance, extensions, async nested fields, form scope, hooks and route groups. `test-support/databuilder-sqlite-check.cjs` additionally exercises insert/read/update/delete with an installed SQLite driver; set `WEBFRAMEZ_DATABUILDER_SQLITE_DRIVER` to its module path when it is not installed by package name.

## Internal responsibilities

- `DataBuilder` coordinates the existing CRUD operations and retains the public v1 methods. Record loading is shared by details, update and deletion.
- `DataBuilderForms` owns registrations and resolves a form once per operation, returning its mode explicitly. There is no hidden request cache or WeakSet-based form mode.
- `DataBuilderFieldsProcessor` owns field/validation registrations and recursive field processing.
- `DataBuilderFrontend` handles frontend descriptors without mutating registered field settings.
- `LegacyFieldTypeAdapter` contains v1 custom-field precedence; processors need no legacy type branches.
- `NumericFieldType` owns numeric interpretation. Validators reuse the resulting value and shared length/size behavior.
- `DataBuilderTypes` defines the shared contracts; `DataBuilderFieldPath` contains the field-path guard used by decorators, forms and field processing.

## Compatibility of subclass hooks and TypeScript field types

Existing `DataBuilder` subclasses remain part of the public extension API. The extracted processors call back through the builder for `handleUnique`, recursive `validateFields`/`applyFields`, `getFieldType`, `getFieldsFrontend`, `removeArrayIndicators` and model registration via `registerType`. Calling `super` uses the standard implementation; thrown validation errors still abort saving. A `validateFields` override can return a new error object without mutating the supplied one.

The **type annotation** `DataBuilderFieldType` retains the original v1 object union, including its `onSave`/`onSearch` signatures and narrowing by `type`. The **runtime value** with that name is the new class constructor, so `class ProjectField extends DataBuilderFieldType` continues to work. For an explicit annotation of a new class instance, use `DataBuilderFieldTypeInstance` (or `InstanceType<typeof DataBuilderFieldType>`):

```ts
const legacy: DataBuilderFieldType = {
    key: "legacy-object",
    type: "object",
    onSave: value => value,
};

class ProjectField extends DataBuilderFieldType {
    key = "project";
    convert(value: any) { return String(value).trim(); }
}
const field: DataBuilderFieldTypeInstance = new ProjectField();

builder.registerFieldType("legacy-object", legacy);
builder.registerFieldType(ProjectField);
```

`getFieldType(key)` retains its v1 return type `DataBuilderFieldType | null` and returns registered legacy object definitions. Built-in and newly registered class instances are available through `getFieldTypeInstance(key): DataBuilderFieldTypeInstance | null`. That lookup also adapts legacy registrations and respects existing `getFieldType` overrides; conversion, validation and autocomplete use it internally. Unknown keys return `null`.

`tests/databuilder-types.test.cjs` compiles the v1 declarations, old-style subclasses and new class-based example against the generated public declarations. Runtime tests additionally verify override dispatch, rejection before writes, `super` delegation, thrown errors and nested fields.
