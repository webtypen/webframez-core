import moment from "moment";
import { DBConnection } from "../Database/DBConnection";
import { NumericFunctions } from "../Functions/NumericFunctions";
import { Request } from "../Router/Request";
import { DatatableColumnContext, DatatableColumnPreferences, DatatableColumnPreferencesConfig } from "./DatatableColumnPreferences";
import { DatatablePreferencesStore } from "./DatatablePreferencesStore";

export interface DatatableModelSelectorConfig {
    value?: string;
    label?: string;
    subtitle?: string;
}

export interface NormalizedDatatableModelSelectorConfig {
    value: string;
    label: string;
    subtitle?: string;
}

export class Datatable {
    static columnPreferences: DatatableColumnPreferencesConfig | false = {};
    columnPreferences?: DatatableColumnPreferencesConfig | false;
    private columnStates = new WeakMap<Request, ReturnType<Datatable["loadColumnState"]>>();
    collection: string | Function = "";
    aggregation: { [key: string]: any } | Function | null = null;
    subAggregation: { [key: string]: any } | Function | null = null;
    filter: { [key: string]: any } | Function | null = null;
    columns: { [key: string]: any } | Function | null = null;
    onPressLink: string | Function | null = null;
    exports: any | null = null;
    perPage: number = 25;
    onRow?: Function;
    onAttributes?: Function;
    onInit?: Function;
    onData?: Function;
    autoApplyFilter: "begin" | "end" | null = "begin";
    autoApplySearch: "begin" | "end" | null = null;
    logAggregation = false;
    defaultUnwind?: string | null = null;
    disablePerPageConfig = false;
    selectable = false;
    modelSelector: boolean | DatatableModelSelectorConfig = false;
    selectableFunctions: {
        [key: string]: {
            label: string;
            icon?: string;
            handle: Function;
            isAvailable?: Function;
            payload?: any;
            confirmMessage?: string;
            confirmOptions?: any;
        };
    } | null = null;

    async getInit(req: Request) {
        const out: any = {
            table: req.body._table,
            selectable: this.selectable ? true : false,
            selectableFunctions: await this.getSelectableFunctionsDef(req),
        };
        const modelSelector = this.getModelSelectorConfig();
        if (modelSelector) {
            out.modelSelector = modelSelector;
        }
        const [filter, state, onPressLink] = await Promise.all([
            this.getFilter(req), this.getColumnState(req), this.getOnPressLink(req),
        ]);
        out.filter = filter;
        out.columns = Object.entries(state.visible).map(([key, column]) => ({ ...column, displayOptions: typeof column.displayOptions === "function" ? true : column.displayOptions, key }));
        out.availableColumns = Object.entries(state.all).map(([key, column]) => ({ ...column, displayOptions: typeof column.displayOptions === "function" ? true : column.displayOptions, key }));
        out.columnPreferences = Boolean(state.scope) && Object.keys(state.all).length > 0;
        out.columnSelection = out.columns.map((column: any) => {
            const saved = state.preferences?.find((entry: any) => entry.key === column.key);
            return { key: column.key, ...(saved?.width ? { width: saved.width } : {}),
                ...(saved?.title ? { title: saved.title } : {}),
                ...(saved?.displayField && saved.displayField === column.displayField ? { displayField: saved.displayField } : {}),
            };
        });
        out.onPressLink = onPressLink;

        if (this.exports) {
            out.export_definitions = [];

            for (let key in this.exports) {
                out.export_definitions.push({
                    key: key,
                    title: this.exports[key].title,
                    contentType: this.exports[key].contentType,
                });
            }
        }

        if (typeof this.onInit === "function") {
            await this.onInit(req, out);
        }
        return out;
    }

    private async loadColumnState(req: Request) {
        const all: Record<string, any> = await this.getColumns(req) ?? {};
        const config = this.columnPreferences ?? Datatable.columnPreferences;
        const store = new DatatablePreferencesStore(config || {});
        const scope = config === false ? null : await store.scope(req);
        const preferences = scope ? await store.load(scope) : null;
        const savedKeys = Array.isArray(preferences) ? preferences.map(entry => entry?.key).filter(key => Object.prototype.hasOwnProperty.call(all, key)) : [];
        const selected = savedKeys.length ? savedKeys : Object.keys(all).filter(key => !all[key].hidden);
        const resolved = await this.resolveDisplayOptions(req, all, selected);
        return { all, visible: DatatableColumnPreferences.apply(resolved, preferences), preferences, store, scope };
    }

    /** Options may be declared inline or loaded from an authenticated host callback. */
    async getColumnDisplayOptions(req: Request, key: string) {
        const all = await this.getColumns(req) ?? {};
        if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(all, key)) {
            throw Object.assign(new Error("Unbekannte Spalte."), { status: 400 });
        }
        const resolved = await this.resolveDisplayOptions(req, all, [key]);
        return resolved[key].displayOptions || [];
    }

    private async resolveDisplayOptions(req: Request, columns: Record<string, any>, keys: string[]) {
        const resolved = { ...columns };
        await Promise.all(Array.from(new Set(keys)).filter(key => typeof key === "string" && Object.prototype.hasOwnProperty.call(columns, key)).map(async key => {
            const column = columns[key];
            if (typeof column.displayOptions === "function") {
                const options = await column.displayOptions(req, key);
                resolved[key] = { ...column, displayOptions: Array.isArray(options) ? options : [] };
            }
        }));
        return resolved;
    }

    private getColumnState(req: Request) {
        let state = this.columnStates.get(req);
        if (!state) {
            state = this.loadColumnState(req);
            this.columnStates.set(req, state);
        }
        return state;
    }

    async saveColumnPreferences(req: Request, columns: unknown) {
        const state = await this.getColumnState(req);
        if (!state.scope) throw Object.assign(new Error("Spalteneinstellungen sind für diesen Benutzer nicht verfügbar."), { status: 403 });
        let preferences;
        try {
            const resolved = await this.resolveDisplayOptions(req, state.all, Array.isArray(columns) ? columns.map(entry => entry?.key) : []);
            preferences = DatatableColumnPreferences.validate(columns, resolved);
        } catch (error) {
            throw Object.assign(error as Error, { status: 400 });
        }
        await state.store.save(state.scope, preferences);
        this.columnStates.delete(req);
        return this.getInit(req);
    }

    async resetColumnPreferences(req: Request) {
        const state = await this.getColumnState(req);
        if (!state.scope) throw Object.assign(new Error("Spalteneinstellungen sind für diesen Benutzer nicht verfügbar."), { status: 403 });
        await state.store.reset(state.scope);
        this.columnStates.delete(req);
        return this.getInit(req);
    }

    /** All definitions remain available through getColumns(); this returns the user's ordered layout. */
    async getVisibleColumns(req: Request): Promise<Record<string, any>> {
        return (await this.getColumnState(req)).visible;
    }

    async getVisibleColumnKeys(req: Request): Promise<string[]> {
        return Object.keys(await this.getVisibleColumns(req));
    }

    async isColumnVisible(req: Request, key: string): Promise<boolean> {
        return Object.prototype.hasOwnProperty.call(await this.getVisibleColumns(req), key);
    }

    async getColumnContext(req: Request): Promise<DatatableColumnContext> {
        const { all, visible: columns } = await this.getColumnState(req);
        const columnKeys = Object.keys(columns);
        const filters = await this.getFilter(req) ?? {};
        const required = new Set<string>(columnKeys);
        for (const key of columnKeys) required.add(columns[key].mapping ?? key);
        for (const key of Object.keys(req.body?.sort ?? {})) required.add(key);
        for (const key of Object.keys(req.body?.search ?? {})) required.add(all[key]?.mapping ?? key);
        for (const key of Object.keys(req.body?.filter ?? {})) required.add(filters[key]?.mapping ?? key);
        for (const [key, sum] of Object.entries(req.body?.sums ?? {})) required.add((sum as any)?.mapping ?? key);
        if (req.body?.mode === "model-selector-preview") {
            const selector = this.getModelSelectorConfig();
            for (const field of [selector?.value, selector?.label, selector?.subtitle]) if (field) required.add(field);
        }
        const matches = (field: string) => Array.from(required).some(key => key === field || key.startsWith(field + ".") || field.startsWith(key + "."));
        return {
            columns, columnKeys,
            isColumnVisible: key => Object.prototype.hasOwnProperty.call(columns, key),
            isColumnRequired: key => matches(key) || (typeof all[key]?.mapping === "string" && matches(all[key].mapping)),
        };
    }

    getModelSelectorConfig(): NormalizedDatatableModelSelectorConfig | null {
        if (!this.modelSelector) {
            return null;
        }

        const config = this.modelSelector === true ? {} : this.modelSelector;
        const subtitle = typeof config.subtitle === "string" && config.subtitle.trim() !== "" ? config.subtitle : undefined;
        return {
            value: typeof config.value === "string" && config.value.trim() !== "" ? config.value.trim() : "_id",
            label: typeof config.label === "string" && config.label.trim() !== "" ? config.label.trim() : "_id",
            ...(subtitle ? { subtitle: subtitle.trim() } : {}),
        };
    }

    async getModelSelectorPreview(req: Request) {
        const config = this.getModelSelectorConfig();
        if (!config) {
            throw new Error("Datatable is not enabled for model selection.");
        }

        const rawValue = req.body.value;
        if (rawValue === undefined || rawValue === null || rawValue === "") {
            return null;
        }

        let value = rawValue;
        if (config.value === "_id") {
            value = DBConnection.getIdAdapter().normalize(rawValue);
            if (value === null) return null;
        }

        const normalizeStages = (stages: any[] | null | undefined) => (stages ?? []).map((stage) => {
            if (!stage || typeof stage !== "object" || !Object.prototype.hasOwnProperty.call(stage, "skipStats")) {
                return stage;
            }
            const { skipStats: _skipStats, ...normalized } = stage;
            return normalized;
        });
        const aggregation = [
            ...normalizeStages(await this.getAggregation(req)),
            ...normalizeStages(await this.getSubAggregation(req)),
            { $match: { [config.value]: value } },
            { $limit: 1 },
        ];

        const connection = await DBConnection.getConnection();
        const results = await DBConnection.documentStore(connection)
            .collection(await this.getCollection(req))
            .aggregate(aggregation, {
                collation: {
                    locale: "de",
                    strength: 2,
                },
            })
            .toArray();

        if (!results[0]) {
            return null;
        }

        let result = results[0];
        if (this.onRow) {
            result = await this.onRow(result);
        }
        if (this.onAttributes) {
            result.__cellattr = await this.onAttributes(result);
        }
        return result;
    }

    async getSelectableFunctionsDef(req: Request) {
        if (!this.selectableFunctions) {
            return null;
        }

        const out = [];
        for (let key in this.selectableFunctions) {
            if (!this.selectableFunctions[key] || !this.selectableFunctions[key].handle) {
                continue;
            }

            if (this.selectableFunctions[key].isAvailable && typeof this.selectableFunctions[key].isAvailable === "function") {
                try {
                    // @ts-ignore
                    const available = await this.selectableFunctions[key].isAvailable(req);
                    if (!available) {
                        continue;
                    }
                } catch (e) {
                    continue;
                }
            }

            out.push({
                label: this.selectableFunctions[key].label,
                icon: this.selectableFunctions[key].icon,
                confirmMessage: this.selectableFunctions[key].confirmMessage,
                confirmOptions: this.selectableFunctions[key].confirmOptions,
                apiFunction: key,
                apiFunctionPayload: this.selectableFunctions[key].payload
                    ? typeof this.selectableFunctions[key].payload === "function"
                        ? await this.selectableFunctions[key].payload(req)
                        : this.selectableFunctions[key].payload
                    : null,
            });
        }
        return out && out.length > 0 ? out : null;
    }

    async getAggregation(req: Request) {
        const prefix: any = [];
        if (this.defaultUnwind && this.defaultUnwind.trim() !== "") {
            prefix.push({ $unwind: this.defaultUnwind });
        }

        const aggr = typeof this.aggregation === "function" ? await this.aggregation(req, await this.getColumnContext(req)) : this.aggregation;
        if (this.autoApplyFilter && req.body.filter && typeof req.body.filter === "object") {
            const filterMatch = await this.getFilterMatch(req, req.body.filter);
            if (this.autoApplyFilter === "begin") {
                return filterMatch && Object.keys(filterMatch).length > 0
                    ? [...prefix, { $match: { ...filterMatch } }, ...aggr]
                    : [...prefix, ...aggr];
            } else if (this.autoApplyFilter === "end") {
                return filterMatch && Object.keys(filterMatch).length > 0
                    ? [...prefix, ...aggr, { $match: { ...filterMatch } }]
                    : [...prefix, ...aggr];
            }
        } else if (this.autoApplySearch && req.body.search && typeof req.body.search === "object") {
            const filterMatch = await this.getFilterMatch(req, req.body.search);
            if (this.autoApplySearch === "begin") {
                return filterMatch && Object.keys(filterMatch).length > 0
                    ? [...prefix, { $match: { ...filterMatch } }, ...aggr]
                    : [...prefix, ...aggr];
            } else if (this.autoApplySearch === "end") {
                return filterMatch && Object.keys(filterMatch).length > 0
                    ? [...prefix, ...aggr, { $match: { ...filterMatch } }]
                    : [...prefix, ...aggr];
            }
        }

        if (prefix && prefix.length > 0) {
            return [...prefix, ...aggr];
        }
        return aggr;
    }

    async getSubAggregation(req: Request) {
        return typeof this.subAggregation === "function" ? await this.subAggregation(req, await this.getColumnContext(req)) : this.subAggregation;
    }

    async getCollection(req: Request) {
        if (this.collection && typeof this.collection === "function") {
            return await this.collection(req);
        }
        return this.collection;
    }

    async getData(req: Request, context?: DatatableColumnContext) {
        const columns = context ?? await this.getColumnContext(req);
        const page = req.body.page && parseInt(req.body.page) > 0 ? parseInt(req.body.page) : 0;
        const aggregation: any = [];
        const aggregationStats: any = [];
        const aggregationDef = await this.getAggregation(req);
        const subAggregation: any = [];
        const subAggregationDef = await this.getSubAggregation(req);
        let hasSkip = false;
        let hasLimit = false;

        if (aggregationDef && aggregationDef.length > 0) {
            for (let entry of aggregationDef) {
                if (entry.$skip !== undefined) {
                    hasSkip = true;
                }
                if (entry.$limit !== undefined) {
                    hasLimit = true;
                }

                if (entry.skipStats) {
                    delete entry.skipStats;
                    aggregation.push(entry);
                } else {
                    aggregation.push(entry);
                    aggregationStats.push(entry);
                }
            }
        }

        if (subAggregationDef && subAggregationDef.length > 0) {
            for (let entry of subAggregationDef) {
                if (entry.$skip !== undefined) {
                    hasSkip = true;
                }
                if (entry.$limit !== undefined) {
                    hasLimit = true;
                }

                if (entry.skipStats) {
                    delete entry.skipStats;
                    subAggregation.push(entry);
                } else {
                    subAggregation.push(entry);
                    aggregationStats.push(entry);
                }
            }
        }

        const perPage =
            req.body.perPage && parseInt(req.body.perPage) > 0 && !this.disablePerPageConfig ? parseInt(req.body.perPage) : this.perPage;
        const aggr = [
            ...(aggregation ? aggregation : []),
            ...(!hasSkip ? [{ $skip: page ? page * perPage : 0 }] : []),
            ...(!hasLimit ? [{ $limit: perPage }] : []),
            ...(subAggregation ? subAggregation : []),
        ];
        if (this.logAggregation) {
            const { log } = console;
            log("[DATATABLE_AGGREGATION" + (req.body._table ? "-" + req.body._table : "") + "]", aggr);
        }

        const connection = await DBConnection.getConnection();
        const results = await DBConnection.documentStore(connection)
            .collection(await this.getCollection(req))
            .aggregate(aggr, {
                collation: {
                    locale: "de",
                    strength: 2,
                },
            })
            .toArray();

        const sumsAfter: any = [];
        const statsGroup: any = { $group: { _id: null, count: { $sum: 1 } } };
        if (req.body.sums && Object.keys(req.body.sums).length > 0) {
            for (let key in req.body.sums) {
                if (req.body.sums[key] && req.body.sums[key].mapping) {
                    if (req.body.sums[key].afterOnRow) {
                        statsGroup.$group["sum_" + req.body.sums[key].mapping] = { $sum: "$" + req.body.sums[key].mapping };
                    } else {
                        sumsAfter.push({ ...req.body.sums[key], key: key });
                    }
                }
            }
        }

        const stats = await DBConnection.documentStore(connection)
            .collection(await this.getCollection(req))
            .aggregate([...(aggregationStats ? aggregationStats : []), statsGroup])
            .toArray();

        if (this.onRow || this.onAttributes) {
            for (let i in results) {
                if (this.onRow) {
                    results[i] = await this.onRow(results[i], req, columns);
                }

                if (this.onAttributes) {
                    results[i].__cellattr = await this.onAttributes(results[i], req, columns);
                }
            }
        }

        const sums: any = {};
        if (req.body.sums && Object.keys(req.body.sums).length > 0) {
            for (let key in req.body.sums) {
                if (req.body.sums[key] && req.body.sums[key].mapping) {
                    sums[req.body.sums[key].mapping] = {
                        ...req.body.sums[key],
                        value:
                            stats &&
                            stats[0] &&
                            stats[0]["sum_" + req.body.sums[key].mapping] !== undefined &&
                            stats[0]["sum_" + req.body.sums[key].mapping] !== null
                                ? NumericFunctions.numberFormat(req.body.sums[key].divideBy > 0 ? stats[0]["sum_" + req.body.sums[key].mapping] / req.body.sums[key].divideBy : stats[0]["sum_" + req.body.sums[key].mapping]) +
                                  (req.body.sums[key].suffix ? req.body.sums[key].suffix : "")
                                : undefined,
                    };
                }
            }
        }

        if (sumsAfter && sumsAfter.length > 0) {
            for (let sum of sumsAfter) {
                for (let i in results) {
                    if (!sums[sum.mapping] || !sums[sum.mapping].value) {
                        sums[sum.mapping] = { ...req.body.sums[sum.key], value: 0 };
                    }

                    sums[sum.mapping].value =
                        (sums[sum.mapping].value ? sums[sum.mapping].value : 0) +
                        (results[i][sum.mapping] !== null &&
                        results[i][sum.mapping] !== undefined &&
                        !isNaN(parseFloat(results[i][sum.mapping]))
                            ? parseFloat(results[i][sum.mapping])
                            : 0);
                }

                sums[sum.mapping].value =
                    NumericFunctions.numberFormat(sums[sum.mapping].value) +
                    (req.body.sums[sum.key].suffix ? req.body.sums[sum.key].suffix : "");
            }
        }

        const data = {
            page: page,
            max_entries: stats && stats[0] && stats[0].count ? stats[0].count : 0,
            total_pages: stats && stats[0] && stats[0].count > 0 ? Math.ceil(stats[0].count / perPage) : 0,
            per_page: perPage,
            entries: results,
            sums: sums,
        };

        if (typeof this.onData === "function") {
            await this.onData(req, data, columns);
        }
        return data;
    }

    async stats(req: Request): Promise<Array<{ label: string; type: string; value: any }>> {
        return [];
    }

    async getTotalData(req: Request) {
        const aggregation: any = [];
        const aggregationDef = await this.getAggregation(req);

        if (aggregationDef && aggregationDef.length > 0) {
            for (let entry of aggregationDef) {
                if (entry.skipStats) {
                    delete entry.skipStats;
                    aggregation.push(entry);
                } else {
                    aggregation.push(entry);
                }
            }
        }

        const connection = await DBConnection.getConnection();
        return await DBConnection.documentStore(connection)
            .collection(await this.getCollection(req))
            .aggregate([...(aggregation ? aggregation : [])])
            .toArray();
    }

    async getFilter(req: Request) {
        if (!this.filter) {
            return null;
        }

        if (typeof this.filter === "function") {
            return await this.filter(req);
        }
        return this.filter;
    }

    async getColumns(req: Request) {
        if (!this.columns) {
            return null;
        }

        if (typeof this.columns === "function") {
            return await this.columns(req);
        }
        return this.columns;
    }

    async getOnPressLink(req: Request) {
        if (!this.onPressLink) {
            return null;
        }

        if (typeof this.onPressLink === "function") {
            return await this.onPressLink(req);
        }
        return this.onPressLink;
    }

    private formatFilterEntryVal(entry: any, filterEl: any, options?: any) {
        const valueClean = entry.value !== undefined && entry.value !== "" ? entry.value : undefined;
        const entryType = entry.type && entry.type.trim() !== "" ? entry.type : filterEl && filterEl.type ? filterEl.type : null;

        let value: any = undefined;
        if (entryType === "number" || entryType === "numeric" || entryType === "currency") {
            value = parseFloat(valueClean.toString().replace(",", "."));
        } else if (entryType === "boolean") {
            if (entry.value === "true") {
                value = true;
            } else if (entry.value === "false") {
                value = { $ne: true };
            }
        } else if (valueClean) {
            if (valueClean.toString().trim() === "==null") {
                value = null;
            } else if (valueClean.toString().trim() === "!=null") {
                value = { $ne: null };
            } else if (valueClean.toString().startsWith("!=[") && valueClean.toString().trim().endsWith("]")) {
                const arr = valueClean
                    .trim()
                    .substring(0, valueClean.length - 1)
                    .replace("!=[", "")
                    .split(",")
                    .map((el: any) => el.trim());
                value = { $nin: arr };
            } else if (valueClean.toString().startsWith("==[") && valueClean.toString().trim().endsWith("]")) {
                const arr = valueClean
                    .trim()
                    .substring(0, valueClean.length - 1)
                    .replace("==[", "")
                    .split(",")
                    .map((el: any) => el.trim());
                value = { $in: arr };
            } else if (valueClean.toString().startsWith("!=")) {
                value = { $ne: valueClean.replace("!=", "") };
            } else if (valueClean.toString().startsWith("==")) {
                value = valueClean.replace("==", "");
            } else if (valueClean.toString().startsWith(">=")) {
                value = { $gte: valueClean.replace(">=", "") };
            } else if (valueClean.toString().startsWith(">")) {
                value = { $gt: valueClean.replace(">", "") };
            } else if (valueClean.toString().startsWith("<=")) {
                value = { $lte: valueClean.replace("<=", "") };
            } else if (valueClean.toString().startsWith("<")) {
                value = { $lt: valueClean.replace("<", "") };
            } else if (options && options.regex) {
                value = new RegExp(valueClean, "i");
            } else {
                value = valueClean;
            }
        }
        return value;
    }

    async getFilterMatch(req: Request, searchOrFilter: any) {
        if (!searchOrFilter || Object.keys(searchOrFilter).length < 1) {
            return {};
        }

        const filterDef = await this.getFilter(req);
        const out: any = {};
        for (let key in searchOrFilter) {
            let value: any = undefined;

            const entry = searchOrFilter[key];
            if (!entry || typeof entry !== "object") {
                continue;
            }

            const valueClean = entry.value !== undefined && entry.value !== "" ? entry.value : undefined;
            const operator =
                entry.operator && entry.operator.trim() !== ""
                    ? entry.operator
                    : entry.mode && entry.mode.trim() !== ""
                    ? entry.mode
                    : "==";
            const filterEl = filterDef && filterDef[key] ? filterDef[key] : null;
            const entryType = entry.type && entry.type.trim() !== "" ? entry.type : filterEl && filterEl.type ? filterEl.type : null;

            if (filterEl && filterEl.ignore) {
                continue;
            }

            // Handle Boolean
            if (filterEl && filterEl.type === "boolean") {
                if ((typeof valueClean === "boolean" && valueClean) || (valueClean && valueClean.toString() === "true")) {
                    out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] = true;
                    continue;
                }
            }

            // Handle type
            const tempType = filterEl && filterEl.type ? filterEl.type : entryType;

            // Handle integer/float range
            if (
                (tempType === "integer-range" ||
                    tempType === "currency" ||
                    tempType === "float-range" ||
                    tempType === "date-range" ||
                    tempType === "daterange") &&
                valueClean !== undefined &&
                valueClean.toString().trim() !== ""
            ) {
                const mappingKey = filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key;

                const cleanVal = (val: any) => {
                    return tempType === "float-range" || tempType === "currency"
                        ? parseFloat(val.toString().replace(",", "."))
                        : tempType === "integer-range"
                        ? parseInt(val.toString().replace(",", "."))
                        : tempType === "date-range" || tempType === "daterange"
                        ? val.indexOf(".") > 0
                            ? moment(val, "DD.MM.YYYY").format("YYYY-MM-DD")
                            : val
                        : val;
                };

                if (valueClean.startsWith("==null")) {
                    out[mappingKey] = null;
                } else if (valueClean.startsWith("!=null")) {
                    out[mappingKey] = null;
                } else if (valueClean.startsWith("<=")) {
                    const val = valueClean.replace("<=", "").trim();

                    out[mappingKey] = {
                        $lte: cleanVal(val),
                    };
                } else if (valueClean.startsWith("<")) {
                    const val = valueClean.replace("<", "").trim();

                    out[mappingKey] = {
                        $lt: cleanVal(val),
                    };
                } else if (valueClean.startsWith(">=")) {
                    const val = valueClean.replace(">=", "").trim();

                    out[mappingKey] = {
                        $gte: cleanVal(val),
                    };
                } else if (valueClean.startsWith(">")) {
                    const val = valueClean.replace(">", "").trim();

                    out[mappingKey] = {
                        $gt: cleanVal(val),
                    };
                } else if (valueClean.toString().startsWith("!=[") && valueClean.toString().trim().endsWith("]")) {
                    const arr = valueClean
                        .replace("!=[", "")
                        .trim()
                        .substring(0, valueClean.length - 1)
                        .split(",")
                        .map((el: any) => el.trim());
                    out[mappingKey] = { $nin: arr.map((el: any) => cleanVal(el)) };
                } else if (valueClean.toString().startsWith("==[") && valueClean.toString().trim().endsWith("]")) {
                    const arr = valueClean
                        .replace("==[", "")
                        .trim()
                        .substring(0, valueClean.length - 1)
                        .split(",")
                        .map((el: any) => el.trim());
                    out[mappingKey] = { $in: arr.map((el: any) => cleanVal(el)) };
                } else if (valueClean.startsWith("!=")) {
                    const val = valueClean.replace("!=", "").trim();

                    out[mappingKey] = {
                        $ne: cleanVal(val),
                    };
                } else if (valueClean.indexOf("-") > 0) {
                    const range = valueClean.split("-");
                    const min = range[0].toString().replace(",", ".");
                    const max = range[1].toString().replace(",", ".");

                    out[mappingKey] = {
                        $gte: cleanVal(min),
                        $lte: cleanVal(max),
                    };
                } else {
                    out[mappingKey] = cleanVal(valueClean);
                }

                continue;
            }

            switch (operator) {
                case "empty":
                    value = null;
                    break;
                case "not_empty":
                    value = { $ne: null };
                    break;
                case "==":
                    if (!filterEl) {
                        value = this.formatFilterEntryVal(entry, filterEl, { regex: true });
                    } else {
                        value = this.formatFilterEntryVal(entry, filterEl, { regex: filterEl && filterEl.regex ? true : false });
                    }
                    break;
                case "!=":
                    const temp = this.formatFilterEntryVal(entry, filterEl);
                    if (temp !== undefined) {
                        value = { $ne: temp };
                    }
                    break;
                case "$gt":
                case "$gte":
                case "$lt":
                case "$lte":
                    if (valueClean !== undefined) {
                        value = {
                            [operator]: entryType === "number" || entryType === "numeric" ? parseFloat(valueClean) : valueClean,
                        };
                    }
                    break;
                default:
                    if (valueClean !== undefined) {
                        value = this.formatFilterEntryVal(entry, filterEl, { regex: true });
                    }
                    break;
            }

            if (tempType === "date") {
                value = value.date1;
            }

            if (value !== undefined && filterEl && filterEl.cast) {
                if (typeof filterEl.cast === "function") {
                    value = await filterEl.cast(value, entry, req);
                } else if (filterEl.cast === "string") {
                    value = value.toString();
                } else if (filterEl.cast === "objectId") {
                    if (value.length === 12 || value.length === 24) {
                        value = await DBConnection.objectId(value);
                    }
                } else if (filterEl.cast === "integer") {
                    value = parseInt(value);
                } else if (filterEl.cast === "float") {
                    value = parseFloat(value);
                } else if (filterEl.cast === "boolean") {
                    value = value === true || value === 1 || value.toString() === "1" || value.toString() === "true" ? true : { $ne: true };
                } else if (filterEl.cast === "date") {
                    value = value ? moment(value).toDate() : null;
                }
            }

            if (value !== undefined) {
                out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] = value;
            }
        }
        return out;
    }
}
