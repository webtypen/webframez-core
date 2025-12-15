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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Datatable = void 0;
const moment_1 = __importDefault(require("moment"));
const DBConnection_1 = require("../Database/DBConnection");
const NumericFunctions_1 = require("../Functions/NumericFunctions");
class Datatable {
    constructor() {
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
    }
    getInit(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const out = { table: req.body._table };
            const promises = [];
            promises.push(new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                out.filter = yield this.getFilter(req);
                resolve(true);
            })));
            promises.push(new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                const cols = [];
                const colsData = yield this.getColumns(req);
                if (colsData && Object.keys(colsData).length > 0) {
                    for (let i in colsData) {
                        cols.push(Object.assign(Object.assign({}, colsData[i]), { key: i }));
                    }
                }
                out.columns = cols;
                resolve(true);
            })));
            promises.push(new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                out.onPressLink = yield this.getOnPressLink(req);
                resolve(true);
            })));
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
            yield Promise.all(promises);
            if (typeof this.onInit === "function") {
                yield this.onInit(req, out);
            }
            return out;
        });
    }
    getAggregation(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const prefix = [];
            if (this.defaultUnwind && this.defaultUnwind.trim() !== "") {
                prefix.push({ $unwind: this.defaultUnwind });
            }
            const aggr = typeof this.aggregation === "function" ? yield this.aggregation(req) : this.aggregation;
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
            return typeof this.subAggregation === "function" ? yield this.subAggregation(req) : this.subAggregation;
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
    getData(req) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const results = yield connection.client
                .db(null)
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
            const stats = yield connection.client
                .db(null)
                .collection(yield this.getCollection(req))
                .aggregate([...(aggregationStats ? aggregationStats : []), statsGroup])
                .toArray();
            if (this.onRow || this.onAttributes) {
                for (let i in results) {
                    if (this.onRow) {
                        results[i] = yield this.onRow(results[i]);
                    }
                    if (this.onAttributes) {
                        results[i].__cellattr = yield this.onAttributes(results[i]);
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
                                ? NumericFunctions_1.NumericFunctions.numberFormat(stats[0]["sum_" + req.body.sums[key].mapping]) +
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
                yield this.onData(req, data);
            }
            return data;
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
            return yield connection.client
                .db(null)
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
