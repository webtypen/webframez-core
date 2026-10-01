import { DataBuilderValidationType } from "../DataBuilderValidationType";

export class EmailValidationType extends DataBuilderValidationType {
    key = "email";

    validate(value: any) {
        return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            ? null
            : "Bitte eine gültige E-Mail-Adresse eingeben.";
    }
}
