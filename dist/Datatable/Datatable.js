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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Datatable = void 0;
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
            return out;
        });
    }
    getAggregation(req) {
        return __awaiter(this, void 0, void 0, function* () {
            return typeof this.aggregation === "function" ? yield this.aggregation(req) : this.aggregation;
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
            const connection = yield DBConnection_1.DBConnection.getConnection();
            const results = yield connection.client
                .db(null)
                .collection(yield this.getCollection(req))
                .aggregate([
                ...(aggregation ? aggregation : []),
                ...(!hasSkip ? [{ $skip: page ? page * this.perPage : 0 }] : []),
                ...(!hasLimit ? [{ $limit: this.perPage }] : []),
                ...(subAggregation ? subAggregation : []),
            ], {
                collation: {
                    locale: "de",
                    strength: 2,
                },
            })
                .toArray();
            const statsGroup = { $group: { _id: null, count: { $sum: 1 } } };
            if (req.body.sums && Object.keys(req.body.sums).length > 0) {
                for (let key in req.body.sums) {
                    if (req.body.sums[key] && req.body.sums[key].mapping) {
                        statsGroup.$group["sum_" + req.body.sums[key].mapping] = { $sum: "$" + req.body.sums[key].mapping };
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
            return {
                page: page,
                max_entries: stats && stats[0] && stats[0].count ? stats[0].count : 0,
                total_pages: stats && stats[0] && stats[0].count > 0 ? Math.ceil(stats[0].count / this.perPage) : 0,
                entries: results,
                sums: sums,
            };
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
                value = false;
            }
        }
        else {
            if (options && options.regex) {
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
                switch (operator) {
                    case "empty":
                        value = null;
                        break;
                    case "not_empty":
                        value = { $ne: null };
                        break;
                    case "==":
                        value = this.formatFilterEntryVal(entry, filterEl);
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
                if (value !== undefined) {
                    out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] = value;
                }
            }
            return out;
        });
    }
}
exports.Datatable = Datatable;
