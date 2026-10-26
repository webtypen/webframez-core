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
            if (entry.title !== undefined) {
                if (typeof entry.title !== "string" || entry.title.length > 160)
                    throw new Error("Ungültiger Spaltentitel (maximal 160 Zeichen).");
                if (entry.title.trim())
                    preference.title = entry.title.trim();
            }
            if (entry.displayField !== undefined && entry.displayField !== "") {
                if (typeof entry.displayField !== "string" || !Array.isArray(columns[entry.key].displayOptions)
                    || !columns[entry.key].displayOptions.some((option) => option.value === entry.displayField)) {
                    throw new Error("Unzulässiges Anzeigefeld für diese Spalte.");
                }
                preference.displayField = entry.displayField;
            }
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
    static display(definition, selected) {
        const column = Object.assign({}, definition);
        const options = Array.isArray(column.displayOptions) ? column.displayOptions : [];
        const option = options.find(entry => entry.value === (selected || column.displayField)) || options[0];
        if (option) {
            column.displayField = option.value;
            for (const key of ["type", "plain", "options"])
                if (option[key] !== undefined)
                    column[key] = option[key];
        }
        return column;
    }
    static apply(columns, preferences) {
        const defaults = () => Object.fromEntries(Object.entries(columns).filter(([, column]) => column.hidden !== true).map(([key, column]) => [key, this.display(column)]));
        if (!Array.isArray(preferences))
            return defaults();
        const available = preferences.filter(entry => entry && typeof entry.key === "string" && Object.prototype.hasOwnProperty.call(columns, entry.key)).map(entry => {
            const options = columns[entry.key].displayOptions;
            // Removed target fields fall back independently; retain the rest of the layout.
            return entry.displayField && (!Array.isArray(options) || !options.some((option) => option.value === entry.displayField))
                ? Object.assign(Object.assign({}, entry), { displayField: undefined }) : entry;
        });
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
            const column = this.display(columns[preference.key], preference.displayField);
            if (preference.title) {
                column.title = preference.title;
                column.label = preference.title;
            }
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
