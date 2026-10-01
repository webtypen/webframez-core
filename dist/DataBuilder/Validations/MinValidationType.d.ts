import { DataBuilderValidationType } from "../DataBuilderValidationType";
export declare class MinValidationType extends DataBuilderValidationType {
    key: string;
    validate(value: any, parameters: any[]): string | null;
}
