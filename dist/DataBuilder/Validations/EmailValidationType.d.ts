import { DataBuilderValidationType } from "../DataBuilderValidationType";
export declare class EmailValidationType extends DataBuilderValidationType {
    key: string;
    validate(value: any): "Bitte eine gültige E-Mail-Adresse eingeben." | null;
}
