import type { DatabaseId } from "../Database/DatabaseAdapter";
import type { Request } from "../Router/Request";

export type DatatableColumnWidth = { mode: "auto" } | { mode: "px" | "percent"; value: number };

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

export class DatatableColumnPreferences {
    static validate(value: unknown, columns: Record<string, any>): DatatableColumnPreference[] {
        if (!Array.isArray(value) || value.length === 0 || value.length > Object.keys(columns).length) {
            throw new Error("Bitte mindestens eine gültige Spalte auswählen.");
        }

        const seen = new Set<string>();
        return value.map(entry => {
            if (!entry || typeof entry.key !== "string" || !Object.prototype.hasOwnProperty.call(columns, entry.key) || seen.has(entry.key)) {
                throw new Error("Unbekannte oder doppelte Spalte.");
            }
            seen.add(entry.key);
            const preference: DatatableColumnPreference = { key: entry.key };
            if (entry.width !== undefined) {
                const width = entry.width;
                if (width?.mode === "auto") {
                    preference.width = { mode: "auto" };
                } else if ((width?.mode === "px" || width?.mode === "percent") && typeof width.value === "number"
                    && Number.isFinite(width.value) && width.value > 0 && width.value <= (width.mode === "percent" ? 100 : 10000)) {
                    preference.width = { mode: width.mode, value: width.value };
                } else {
                    throw new Error("Ungültige Spaltenbreite.");
                }
            }
            return preference;
        });
    }

    static apply(columns: Record<string, any>, preferences: unknown): Record<string, any> {
        const defaults = () => Object.fromEntries(Object.entries(columns).filter(([, column]) => column.hidden !== true));
        if (!Array.isArray(preferences)) return defaults();

        const available = preferences.filter(entry => entry && typeof entry.key === "string" && Object.prototype.hasOwnProperty.call(columns, entry.key));
        if (!available.length) return defaults();
        let validated: DatatableColumnPreference[];
        try {
            validated = this.validate(available, columns);
        } catch {
            return defaults();
        }
        return Object.fromEntries(validated.map(preference => {
            const column = { ...columns[preference.key] };
            if (preference.width) {
                delete column.width;
                delete column.minWidth;
                delete column.maxWidth;
                column.autogrow = preference.width.mode === "auto";
                column.grow = preference.width.mode === "auto" ? 1 : 0;
                if (preference.width.mode === "px") column.width = preference.width.value;
                if (preference.width.mode === "percent") column.width = `${preference.width.value}%`;
            }
            return [preference.key, column];
        }));
    }
}
