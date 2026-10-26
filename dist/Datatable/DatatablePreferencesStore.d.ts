import type { Request } from "../Router/Request";
import type { DatatableColumnPreference, DatatableColumnPreferencesConfig } from "./DatatableColumnPreferences";
/** Document-store adapter for per-owner table layouts. The deterministic ID makes first saves atomic. */
export declare class DatatablePreferencesStore {
    private config;
    constructor(config?: DatatableColumnPreferencesConfig);
    scope(req: Request): Promise<{
        table: any;
        _id: string;
    } | null>;
    private collection;
    load(scope: Record<string, any>): Promise<any>;
    save(scope: Record<string, any>, columns: DatatableColumnPreference[]): Promise<void>;
    reset(scope: Record<string, any>): Promise<void>;
}
