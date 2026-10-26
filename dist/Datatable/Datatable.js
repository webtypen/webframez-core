"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Datatable = void 0;
const moment_1 = __importDefault(require("moment"));
const DBConnection_1 = require("../Database/DBConnection");
const NumericFunctions_1 = require("../Functions/NumericFunctions");
const DatatableColumnPreferences_1 = require("./DatatableColumnPreferences");
const DatatablePreferencesStore_1 = require("./DatatablePreferencesStore");
class Datatable {
    constructor() {
        this.columnStates = new WeakMap();
        this.collection = "";
        this.aggregation = null;
        this.subAggregation = null;
        this.filter = null;
        this.columns = null;
        this.onPressLink = null;
        this.exports = null;
        this.perPage = 25;
        this.autoApplyFilter = "begin";
        this.autoApplySearch = null;
        this.logAggregation = false;
        this.defaultUnwind = null;
        this.disablePerPageConfig = false;
        this.selectable = false;
        this.modelSelector = false;
        this.selectableFunctions = null;
    }
    getInit(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const out = {
                table: req.body._table,
                selectable: this.selectable ? true : false,
                selectableFunctions: yield this.getSelectableFunctionsDef(req),
            };
            const modelSelector = this.getModelSelectorConfig();
            if (modelSelector) {
                out.modelSelector = modelSelector;
            }
            const [filter, state, onPressLink] = yield Promise.all([
                this.getFilter(req), this.getColumnState(req), this.getOnPressLink(req),
            ]);
            out.filter = filter;
            out.columns = Object.entries(state.visible).map(([key, column]) => (Object.assign(Object.assign({}, column), { key })));
            out.availableColumns = Object.entries(state.all).map(([key, column]) => (Object.assign(Object.assign({}, column), { key })));
            out.columnPreferences = Boolean(state.scope) && Object.keys(state.all).length > 0;
            out.columnSelection = out.columns.map((column) => {
                var _a, _b;
                return (Object.assign({ key: column.key }, (((_b = (_a = state.preferences) === null || _a === void 0 ? void 0 : _a.find((entry) => entry.key === column.key)) === null || _b === void 0 ? void 0 : _b.width)
                    ? { width: state.preferences.find((entry) => entry.key === column.key).width } : {})));
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
                yield this.onInit(req, out);
            }
            return out;
        });
    }
    loadColumnState(req) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const all = (_a = yield this.getColumns(req)) !== null && _a !== void 0 ? _a : {};
            const config = (_b = this.columnPreferences) !== null && _b !== void 0 ? _b : Datatable.columnPreferences;
            const store = new DatatablePreferencesStore_1.DatatablePreferencesStore(config || {});
            const scope = config === false ? null : yield store.scope(req);
            const preferences = scope ? yield store.load(scope) : null;
            return { all, visible: DatatableColumnPreferences_1.DatatableColumnPreferences.apply(all, preferences), preferences, store, scope };
        });
    }
    getColumnState(req) {
        let state = this.columnStates.get(req);
        if (!state) {
            state = this.loadColumnState(req);
            this.columnStates.set(req, state);
        }
        return state;
    }
    saveColumnPreferences(req, columns) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = yield this.getColumnState(req);
            if (!state.scope)
                throw Object.assign(new Error("Spalteneinstellungen sind für diesen Benutzer nicht verfügbar."), { status: 403 });
            let preferences;
            try {
                preferences = DatatableColumnPreferences_1.DatatableColumnPreferences.validate(columns, state.all);
            }
            catch (error) {
                throw Object.assign(error, { status: 400 });
            }
            yield state.store.save(state.scope, preferences);
            this.columnStates.delete(req);
            return this.getInit(req);
        });
    }
    resetColumnPreferences(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = yield this.getColumnState(req);
            if (!state.scope)
                throw Object.assign(new Error("Spalteneinstellungen sind für diesen Benutzer nicht verfügbar."), { status: 403 });
            yield state.store.reset(state.scope);
            this.columnStates.delete(req);
            return this.getInit(req);
        });
    }
    /** All definitions remain available through getColumns(); this returns the user's ordered layout. */
    getVisibleColumns(req) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.getColumnState(req)).visible;
        });
    }
    getVisibleColumnKeys(req) {
        return __awaiter(this, void 0, void 0, function* () {
            return Object.keys(yield this.getVisibleColumns(req));
        });
    }
    isColumnVisible(req, key) {
        return __awaiter(this, void 0, void 0, function* () {
            return Object.prototype.hasOwnProperty.call(yield this.getVisibleColumns(req), key);
        });
    }
    getColumnContext(req) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        return __awaiter(this, void 0, void 0, function* () {
            const { all, visible: columns } = yield this.getColumnState(req);
            const columnKeys = Object.keys(columns);
            const filters = (_a = yield this.getFilter(req)) !== null && _a !== void 0 ? _a : {};
            const required = new Set(columnKeys);
            for (const key of columnKeys)
                required.add((_b = columns[key].mapping) !== null && _b !== void 0 ? _b : key);
            for (const key of Object.keys((_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.sort) !== null && _d !== void 0 ? _d : {}))
                required.add(key);
            for (const key of Object.keys((_f = (_e = req.body) === null || _e === void 0 ? void 0 : _e.search) !== null && _f !== void 0 ? _f : {}))
                required.add((_h = (_g = all[key]) === null || _g === void 0 ? void 0 : _g.mapping) !== null && _h !== void 0 ? _h : key);
            for (const key of Object.keys((_k = (_j = req.body) === null || _j === void 0 ? void 0 : _j.filter) !== null && _k !== void 0 ? _k : {}))
                required.add((_m = (_l = filters[key]) === null || _l === void 0 ? void 0 : _l.mapping) !== null && _m !== void 0 ? _m : key);
            for (const [key, sum] of Object.entries((_p = (_o = req.body) === null || _o === void 0 ? void 0 : _o.sums) !== null && _p !== void 0 ? _p : {}))
                required.add((_q = sum === null || sum === void 0 ? void 0 : sum.mapping) !== null && _q !== void 0 ? _q : key);
            if (((_r = req.body) === null || _r === void 0 ? void 0 : _r.mode) === "model-selector-preview") {
                const selector = this.getModelSelectorConfig();
                for (const field of [selector === null || selector === void 0 ? void 0 : selector.value, selector === null || selector === void 0 ? void 0 : selector.label, selector === null || selector === void 0 ? void 0 : selector.subtitle])
                    if (field)
                        required.add(field);
            }
            const matches = (field) => Array.from(required).some(key => key === field || key.startsWith(field + ".") || field.startsWith(key + "."));
            return {
                columns, columnKeys,
                isColumnVisible: key => Object.prototype.hasOwnProperty.call(columns, key),
                isColumnRequired: key => { var _a; return matches(key) || (typeof ((_a = all[key]) === null || _a === void 0 ? void 0 : _a.mapping) === "string" && matches(all[key].mapping)); },
            };
        });
    }
    getModelSelectorConfig() {
        if (!this.modelSelector) {
            return null;
        }
        const config = this.modelSelector === true ? {} : this.modelSelector;
        const subtitle = typeof config.subtitle === "string" && config.subtitle.trim() !== "" ? config.subtitle : undefined;
        return Object.assign({ value: typeof config.value === "string" && config.value.trim() !== "" ? config.value.trim() : "_id", label: typeof config.label === "string" && config.label.trim() !== "" ? config.label.trim() : "_id" }, (subtitle ? { subtitle: subtitle.trim() } : {}));
    }
    getModelSelectorPreview(req) {
        return __awaiter(this, void 0, void 0, function* () {
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
                value = DBConnection_1.DBConnection.getIdAdapter().normalize(rawValue);
                if (value === null)
                    return null;
            }
            const normalizeStages = (stages) => (stages !== null && stages !== void 0 ? stages : []).map((stage) => {
                if (!stage || typeof stage !== "object" || !Object.prototype.hasOwnProperty.call(stage, "skipStats")) {
                    return stage;
                }
                const { skipStats: _skipStats } = stage, normalized = __rest(stage, ["skipStats"]);
                return normalized;
            });
            const aggregation = [
                ...normalizeStages(yield this.getAggregation(req)),
                ...normalizeStages(yield this.getSubAggregation(req)),
                { $match: { [config.value]: value } },
                { $limit: 1 },
            ];
            const connection = yield DBConnection_1.DBConnection.getConnection();
            const results = yield DBConnection_1.DBConnection.documentStore(connection)
                .collection(yield this.getCollection(req))
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
                result = yield this.onRow(result);
            }
            if (this.onAttributes) {
                result.__cellattr = yield this.onAttributes(result);
            }
            return result;
        });
    }
    getSelectableFunctionsDef(req) {
        return __awaiter(this, void 0, void 0, function* () {
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
                        const available = yield this.selectableFunctions[key].isAvailable(req);
                        if (!available) {
                            continue;
                        }
                    }
                    catch (e) {
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
                            ? yield this.selectableFunctions[key].payload(req)
                            : this.selectableFunctions[key].payload
                        : null,
                });
            }
            return out && out.length > 0 ? out : null;
        });
    }
    getAggregation(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const prefix = [];
            if (this.defaultUnwind && this.defaultUnwind.trim() !== "") {
                prefix.push({ $unwind: this.defaultUnwind });
            }
            const aggr = typeof this.aggregation === "function" ? yield this.aggregation(req, yield this.getColumnContext(req)) : this.aggregation;
            if (this.autoApplyFilter && req.body.filter && typeof req.body.filter === "object") {
                const filterMatch = yield this.getFilterMatch(req, req.body.filter);
                if (this.autoApplyFilter === "begin") {
                    return filterMatch && Object.keys(filterMatch).length > 0
                        ? [...prefix, { $match: Object.assign({}, filterMatch) }, ...aggr]
                        : [...prefix, ...aggr];
                }
                else if (this.autoApplyFilter === "end") {
                    return filterMatch && Object.keys(filterMatch).length > 0
                        ? [...prefix, ...aggr, { $match: Object.assign({}, filterMatch) }]
                        : [...prefix, ...aggr];
                }
            }
            else if (this.autoApplySearch && req.body.search && typeof req.body.search === "object") {
                const filterMatch = yield this.getFilterMatch(req, req.body.search);
                if (this.autoApplySearch === "begin") {
                    return filterMatch && Object.keys(filterMatch).length > 0
                        ? [...prefix, { $match: Object.assign({}, filterMatch) }, ...aggr]
                        : [...prefix, ...aggr];
                }
                else if (this.autoApplySearch === "end") {
                    return filterMatch && Object.keys(filterMatch).length > 0
                        ? [...prefix, ...aggr, { $match: Object.assign({}, filterMatch) }]
                        : [...prefix, ...aggr];
                }
            }
            if (prefix && prefix.length > 0) {
                return [...prefix, ...aggr];
            }
            return aggr;
        });
    }
    getSubAggregation(req) {
        return __awaiter(this, void 0, void 0, function* () {
            return typeof this.subAggregation === "function" ? yield this.subAggregation(req, yield this.getColumnContext(req)) : this.subAggregation;
        });
    }
    getCollection(req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.collection && typeof this.collection === "function") {
                return yield this.collection(req);
            }
            return this.collection;
        });
    }
    getData(req, context) {
        return __awaiter(this, void 0, void 0, function* () {
            const columns = context !== null && context !== void 0 ? context : yield this.getColumnContext(req);
            const page = req.body.page && parseInt(req.body.page) > 0 ? parseInt(req.body.page) : 0;
            const aggregation = [];
            const aggregationStats = [];
            const aggregationDef = yield this.getAggregation(req);
            const subAggregation = [];
            const subAggregationDef = yield this.getSubAggregation(req);
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
                    }
                    else {
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
                    }
                    else {
                        subAggregation.push(entry);
                        aggregationStats.push(entry);
                    }
                }
            }
            const perPage = req.body.perPage && parseInt(req.body.perPage) > 0 && !this.disablePerPageConfig ? parseInt(req.body.perPage) : this.perPage;
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
            const connection = yield DBConnection_1.DBConnection.getConnection();
            const results = yield DBConnection_1.DBConnection.documentStore(connection)
                .collection(yield this.getCollection(req))
                .aggregate(aggr, {
                collation: {
                    locale: "de",
                    strength: 2,
                },
            })
                .toArray();
            const sumsAfter = [];
            const statsGroup = { $group: { _id: null, count: { $sum: 1 } } };
            if (req.body.sums && Object.keys(req.body.sums).length > 0) {
                for (let key in req.body.sums) {
                    if (req.body.sums[key] && req.body.sums[key].mapping) {
                        if (req.body.sums[key].afterOnRow) {
                            statsGroup.$group["sum_" + req.body.sums[key].mapping] = { $sum: "$" + req.body.sums[key].mapping };
                        }
                        else {
                            sumsAfter.push(Object.assign(Object.assign({}, req.body.sums[key]), { key: key }));
                        }
                    }
                }
            }
            const stats = yield DBConnection_1.DBConnection.documentStore(connection)
                .collection(yield this.getCollection(req))
                .aggregate([...(aggregationStats ? aggregationStats : []), statsGroup])
                .toArray();
            if (this.onRow || this.onAttributes) {
                for (let i in results) {
                    if (this.onRow) {
                        results[i] = yield this.onRow(results[i], req, columns);
                    }
                    if (this.onAttributes) {
                        results[i].__cellattr = yield this.onAttributes(results[i], req, columns);
                    }
                }
            }
            const sums = {};
            if (req.body.sums && Object.keys(req.body.sums).length > 0) {
                for (let key in req.body.sums) {
                    if (req.body.sums[key] && req.body.sums[key].mapping) {
                        sums[req.body.sums[key].mapping] = Object.assign(Object.assign({}, req.body.sums[key]), { value: stats &&
                                stats[0] &&
                                stats[0]["sum_" + req.body.sums[key].mapping] !== undefined &&
                                stats[0]["sum_" + req.body.sums[key].mapping] !== null
                                ? NumericFunctions_1.NumericFunctions.numberFormat(req.body.sums[key].divideBy > 0 ? stats[0]["sum_" + req.body.sums[key].mapping] / req.body.sums[key].divideBy : stats[0]["sum_" + req.body.sums[key].mapping]) +
                                    (req.body.sums[key].suffix ? req.body.sums[key].suffix : "")
                                : undefined });
                    }
                }
            }
            if (sumsAfter && sumsAfter.length > 0) {
                for (let sum of sumsAfter) {
                    for (let i in results) {
                        if (!sums[sum.mapping] || !sums[sum.mapping].value) {
                            sums[sum.mapping] = Object.assign(Object.assign({}, req.body.sums[sum.key]), { value: 0 });
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
                        NumericFunctions_1.NumericFunctions.numberFormat(sums[sum.mapping].value) +
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
                yield this.onData(req, data, columns);
            }
            return data;
        });
    }
    stats(req) {
        return __awaiter(this, void 0, void 0, function* () {
            return [];
        });
    }
    getTotalData(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const aggregation = [];
            const aggregationDef = yield this.getAggregation(req);
            if (aggregationDef && aggregationDef.length > 0) {
                for (let entry of aggregationDef) {
                    if (entry.skipStats) {
                        delete entry.skipStats;
                        aggregation.push(entry);
                    }
                    else {
                        aggregation.push(entry);
                    }
                }
            }
            const connection = yield DBConnection_1.DBConnection.getConnection();
            return yield DBConnection_1.DBConnection.documentStore(connection)
                .collection(yield this.getCollection(req))
                .aggregate([...(aggregation ? aggregation : [])])
                .toArray();
        });
    }
    getFilter(req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.filter) {
                return null;
            }
            if (typeof this.filter === "function") {
                return yield this.filter(req);
            }
            return this.filter;
        });
    }
    getColumns(req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.columns) {
                return null;
            }
            if (typeof this.columns === "function") {
                return yield this.columns(req);
            }
            return this.columns;
        });
    }
    getOnPressLink(req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.onPressLink) {
                return null;
            }
            if (typeof this.onPressLink === "function") {
                return yield this.onPressLink(req);
            }
            return this.onPressLink;
        });
    }
    formatFilterEntryVal(entry, filterEl, options) {
        const valueClean = entry.value !== undefined && entry.value !== "" ? entry.value : undefined;
        const entryType = entry.type && entry.type.trim() !== "" ? entry.type : filterEl && filterEl.type ? filterEl.type : null;
        let value = undefined;
        if (entryType === "number" || entryType === "numeric" || entryType === "currency") {
            value = parseFloat(valueClean.toString().replace(",", "."));
        }
        else if (entryType === "boolean") {
            if (entry.value === "true") {
                value = true;
            }
            else if (entry.value === "false") {
                value = { $ne: true };
            }
        }
        else if (valueClean) {
            if (valueClean.toString().trim() === "==null") {
                value = null;
            }
            else if (valueClean.toString().trim() === "!=null") {
                value = { $ne: null };
            }
            else if (valueClean.toString().startsWith("!=[") && valueClean.toString().trim().endsWith("]")) {
                const arr = valueClean
                    .trim()
                    .substring(0, valueClean.length - 1)
                    .replace("!=[", "")
                    .split(",")
                    .map((el) => el.trim());
                value = { $nin: arr };
            }
            else if (valueClean.toString().startsWith("==[") && valueClean.toString().trim().endsWith("]")) {
                const arr = valueClean
                    .trim()
                    .substring(0, valueClean.length - 1)
                    .replace("==[", "")
                    .split(",")
                    .map((el) => el.trim());
                value = { $in: arr };
            }
            else if (valueClean.toString().startsWith("!=")) {
                value = { $ne: valueClean.replace("!=", "") };
            }
            else if (valueClean.toString().startsWith("==")) {
                value = valueClean.replace("==", "");
            }
            else if (valueClean.toString().startsWith(">=")) {
                value = { $gte: valueClean.replace(">=", "") };
            }
            else if (valueClean.toString().startsWith(">")) {
                value = { $gt: valueClean.replace(">", "") };
            }
            else if (valueClean.toString().startsWith("<=")) {
                value = { $lte: valueClean.replace("<=", "") };
            }
            else if (valueClean.toString().startsWith("<")) {
                value = { $lt: valueClean.replace("<", "") };
            }
            else if (options && options.regex) {
                value = new RegExp(valueClean, "i");
            }
            else {
                value = valueClean;
            }
        }
        return value;
    }
    getFilterMatch(req, searchOrFilter) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!searchOrFilter || Object.keys(searchOrFilter).length < 1) {
                return {};
            }
            const filterDef = yield this.getFilter(req);
            const out = {};
            for (let key in searchOrFilter) {
                let value = undefined;
                const entry = searchOrFilter[key];
                if (!entry || typeof entry !== "object") {
                    continue;
                }
                const valueClean = entry.value !== undefined && entry.value !== "" ? entry.value : undefined;
                const operator = entry.operator && entry.operator.trim() !== ""
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
                if ((tempType === "integer-range" ||
                    tempType === "currency" ||
                    tempType === "float-range" ||
                    tempType === "date-range" ||
                    tempType === "daterange") &&
                    valueClean !== undefined &&
                    valueClean.toString().trim() !== "") {
                    const mappingKey = filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key;
                    const cleanVal = (val) => {
                        return tempType === "float-range" || tempType === "currency"
                            ? parseFloat(val.toString().replace(",", "."))
                            : tempType === "integer-range"
                                ? parseInt(val.toString().replace(",", "."))
                                : tempType === "date-range" || tempType === "daterange"
                                    ? val.indexOf(".") > 0
                                        ? (0, moment_1.default)(val, "DD.MM.YYYY").format("YYYY-MM-DD")
                                        : val
                                    : val;
                    };
                    if (valueClean.startsWith("==null")) {
                        out[mappingKey] = null;
                    }
                    else if (valueClean.startsWith("!=null")) {
                        out[mappingKey] = null;
                    }
                    else if (valueClean.startsWith("<=")) {
                        const val = valueClean.replace("<=", "").trim();
                        out[mappingKey] = {
                            $lte: cleanVal(val),
                        };
                    }
                    else if (valueClean.startsWith("<")) {
                        const val = valueClean.replace("<", "").trim();
                        out[mappingKey] = {
                            $lt: cleanVal(val),
                        };
                    }
                    else if (valueClean.startsWith(">=")) {
                        const val = valueClean.replace(">=", "").trim();
                        out[mappingKey] = {
                            $gte: cleanVal(val),
                        };
                    }
                    else if (valueClean.startsWith(">")) {
                        const val = valueClean.replace(">", "").trim();
                        out[mappingKey] = {
                            $gt: cleanVal(val),
                        };
                    }
                    else if (valueClean.toString().startsWith("!=[") && valueClean.toString().trim().endsWith("]")) {
                        const arr = valueClean
                            .replace("!=[", "")
                            .trim()
                            .substring(0, valueClean.length - 1)
                            .split(",")
                            .map((el) => el.trim());
                        out[mappingKey] = { $nin: arr.map((el) => cleanVal(el)) };
                    }
                    else if (valueClean.toString().startsWith("==[") && valueClean.toString().trim().endsWith("]")) {
                        const arr = valueClean
                            .replace("==[", "")
                            .trim()
                            .substring(0, valueClean.length - 1)
                            .split(",")
                            .map((el) => el.trim());
                        out[mappingKey] = { $in: arr.map((el) => cleanVal(el)) };
                    }
                    else if (valueClean.startsWith("!=")) {
                        const val = valueClean.replace("!=", "").trim();
                        out[mappingKey] = {
                            $ne: cleanVal(val),
                        };
                    }
                    else if (valueClean.indexOf("-") > 0) {
                        const range = valueClean.split("-");
                        const min = range[0].toString().replace(",", ".");
                        const max = range[1].toString().replace(",", ".");
                        out[mappingKey] = {
                            $gte: cleanVal(min),
                            $lte: cleanVal(max),
                        };
                    }
                    else {
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
                        }
                        else {
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
                        value = yield filterEl.cast(value, entry, req);
                    }
                    else if (filterEl.cast === "string") {
                        value = value.toString();
                    }
                    else if (filterEl.cast === "objectId") {
                        if (value.length === 12 || value.length === 24) {
                            value = yield DBConnection_1.DBConnection.objectId(value);
                        }
                    }
                    else if (filterEl.cast === "integer") {
                        value = parseInt(value);
                    }
                    else if (filterEl.cast === "float") {
                        value = parseFloat(value);
                    }
                    else if (filterEl.cast === "boolean") {
                        value = value === true || value === 1 || value.toString() === "1" || value.toString() === "true" ? true : { $ne: true };
                    }
                    else if (filterEl.cast === "date") {
                        value = value ? (0, moment_1.default)(value).toDate() : null;
                    }
                }
                if (value !== undefined) {
                    out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] = value;
                }
            }
            return out;
        });
    }
}
exports.Datatable = Datatable;
Datatable.columnPreferences = {};
