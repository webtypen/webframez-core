import { DataBuilderValidationType } from "../DataBuilderValidationType";
export declare class MaxValidationType extends DataBuilderValidationType {
    key: string;
    validate(value: any, parameters: any[]): string | null;
}
