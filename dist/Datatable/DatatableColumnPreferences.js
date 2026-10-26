"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatatableColumnPreferences = void 0;
class DatatableColumnPreferences {
    static validate(value, columns) {
        if (!Array.isArray(value) || value.length === 0 || value.length > Object.keys(columns).length) {
            throw new Error("Bitte mindestens eine gültige Spalte auswählen.");
        }
        const seen = new Set();
        return value.map(entry => {
            if (!entry || typeof entry.key !== "string" || !Object.prototype.hasOwnProperty.call(columns, entry.key) || seen.has(entry.key)) {
                throw new Error("Unbekannte oder doppelte Spalte.");
            }
            seen.add(entry.key);
            const preference = { key: entry.key };
            if (entry.width !== undefined) {
                const width = entry.width;
                if ((width === null || width === void 0 ? void 0 : width.mode) === "auto") {
                    preference.width = { mode: "auto" };
                }
                else if (((width === null || width === void 0 ? void 0 : width.mode) === "px" || (width === null || width === void 0 ? void 0 : width.mode) === "percent") && typeof width.value === "number"
                    && Number.isFinite(width.value) && width.value > 0 && width.value <= (width.mode === "percent" ? 100 : 10000)) {
                    preference.width = { mode: width.mode, value: width.value };
                }
                else {
                    throw new Error("Ungültige Spaltenbreite.");
                }
            }
            return preference;
        });
    }
    static apply(columns, preferences) {
        const defaults = () => Object.fromEntries(Object.entries(columns).filter(([, column]) => column.hidden !== true));
        if (!Array.isArray(preferences))
            return defaults();
        const available = preferences.filter(entry => entry && typeof entry.key === "string" && Object.prototype.hasOwnProperty.call(columns, entry.key));
        if (!available.length)
            return defaults();
        let validated;
        try {
            validated = this.validate(available, columns);
        }
        catch (_a) {
            return defaults();
        }
        return Object.fromEntries(validated.map(preference => {
            const column = Object.assign({}, columns[preference.key]);
            if (preference.width) {
                delete column.width;
                delete column.minWidth;
                delete column.maxWidth;
                column.autogrow = preference.width.mode === "auto";
                column.grow = preference.width.mode === "auto" ? 1 : 0;
                if (preference.width.mode === "px")
                    column.width = preference.width.value;
                if (preference.width.mode === "percent")
                    column.width = `${preference.width.value}%`;
            }
            return [preference.key, column];
        }));
    }
}
exports.DatatableColumnPreferences = DatatableColumnPreferences;
