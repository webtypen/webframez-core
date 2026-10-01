import {
    Model, ModelForm, ModelFormContext, Field, Forms, Validates, Route,
    DataBuilderFieldType, DataBuilderFieldContext, DataBuilderValidationType,
} from "../dist";

class UserProfileForm extends ModelForm<User> {
    key = "profile";

    layout(_context: ModelFormContext<User>) {
        return [this.component("card", {
            title: "Profil",
            children: [
                this.field("email"),
                this.component("row", { children: [this.field("name"), this.field("code")] }),
                this.field("addresses", { fields: [this.field("city"), this.field("street")] }),
            ],
        })];
    }

    options() { return { onSaveRedirect: () => "/users", allowDeletion: false }; }
}

class UserSettingsForm extends ModelForm<User> {
    key = "settings";

    layout() { return [this.field("enabled")]; }
}

@Forms(() => [UserProfileForm, UserSettingsForm])
class User extends Model {
    __table = "users";

    @Field({ required: true, label: "E-Mail" })
    @Validates("email", ["length", 3], ["max", 30])
    declare email: string;

    @Field({ label: "Name" })
    declare name: string;

    @Field({ type: "code", label: "Kürzel" })
    @Validates(["prefix", "SB-"])
    declare code: string;

    @Field({ type: "boolean", label: "Aktiv" })
    declare enabled: boolean;

    @Field({ type: "array", schema: {
        city: { type: "string", required: true, label: "Stadt" },
        street: { type: "string", label: "Straße" },
    } })
    declare addresses: { city: string; street: string }[];
}

class CodeField extends DataBuilderFieldType {
    key = "code";
    type = "string";

    missingValue(_context: DataBuilderFieldContext) { return "SB-"; }

    convert(value: any) { return String(value).trim(); }
}

class PrefixValidation extends DataBuilderValidationType {
    key = "prefix";

    validate(value: any, [prefix]: any[]) {
        if (typeof prefix !== "string") throw new Error("prefix requires a string parameter");
        return typeof value === "string" && value.startsWith(prefix) ? null : `Der Wert muss mit ${prefix} beginnen.`;
    }
}

Route.databuilder("/api/databuilder", {
    models: { users: User },
    fieldTypes: [CodeField],
    validationTypes: [PrefixValidation],
    middleware: ["auth"], // Use your registered middleware names.
});
