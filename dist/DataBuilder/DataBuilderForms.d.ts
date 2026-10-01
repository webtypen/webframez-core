import type { Request } from "../Router/Request";
import type { DataBuilderType } from "./DataBuilderTypes";
export type ResolvedDataBuilderForm = {
    type: DataBuilderType;
    structured: boolean;
};
/** Owns model registrations and creates the selected form for one operation. */
export declare class DataBuilderForms {
    private readonly registerType;
    constructor(registerType?: (type: DataBuilderType) => void);
    private types;
    private forms;
    get(key: string): DataBuilderType | null;
    register(type: DataBuilderType): void;
    registerModel(key: string, model: any): this;
    resolve(type: DataBuilderType, req: Request): Promise<ResolvedDataBuilderForm>;
}
