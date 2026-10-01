import { DataBuilderValidationType } from "../DataBuilderValidationType";
export declare class LengthValidationType extends DataBuilderValidationType {
    key: string;
    validate(value: any, parameters: any[]): string | null;
}
