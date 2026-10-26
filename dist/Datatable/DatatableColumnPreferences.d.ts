import type { DatabaseId } from "../Database/DatabaseAdapter";
import type { Request } from "../Router/Request";
export type DatatableColumnWidth = {
    mode: "auto";
} | {
    mode: "px" | "percent";
    value: number;
};
export interface DatatableColumnPreference {
    key: string;
    /** Omit to retain the current backend default. */
    width?: DatatableColumnWidth;
}
export interface DatatableColumnPreferencesConfig {
    collection?: string;
    connection?: string;
    /** Resolve exclusively from authenticated server context. Null disables persistence for this request. */
    owner?: (req: Request) => Record<string, DatabaseId> | null | Promise<Record<string, DatabaseId> | null>;
}
export interface DatatableColumnContext {
    columns: Record<string, any>;
    columnKeys: string[];
    isColumnVisible: (key: string) => boolean;
    /** Includes visible mappings and fields used by filters, search, sorting or sums. */
    isColumnRequired: (key: string) => boolean;
}
export declare class DatatableColumnPreferences {
    static validate(value: unknown, columns: Record<string, any>): DatatableColumnPreference[];
    static apply(columns: Record<string, any>, preferences: unknown): Record<string, any>;
}
