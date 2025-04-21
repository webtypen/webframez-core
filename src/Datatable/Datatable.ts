import { DBConnection } from "../Database/DBConnection";
import { NumericFunctions } from "../Functions/NumericFunctions";
import { Request } from "../Router/Request";

export class Datatable {
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
    autoApplyFilter: "begin" | "end" | null = "begin";
    autoApplySearch: "begin" | "end" | null = null;
    logAggregation = false;
    defaultUnwind?: string | null = null;
    disablePerPageConfig = false;

    async getInit(req: Request) {
        const out: any = { table: req.body._table };
        const promises = [];
        promises.push(
            new Promise(async (resolve) => {
                out.filter = await this.getFilter(req);
                resolve(true);
            })
        );
        promises.push(
            new Promise(async (resolve) => {
                const cols: any = [];
                const colsData = await this.getColumns(req);
                if (colsData && Object.keys(colsData).length > 0) {
                    for (let i in colsData) {
                        cols.push({ ...colsData[i], key: i });
                    }
                }
                out.columns = cols;
                resolve(true);
            })
        );
        promises.push(
            new Promise(async (resolve) => {
                out.onPressLink = await this.getOnPressLink(req);
                resolve(true);
            })
        );

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

        await Promise.all(promises);
        return out;
    }

    async getAggregation(req: Request) {
        const prefix: any = [];
        if (this.defaultUnwind && this.defaultUnwind.trim() !== "") {
            prefix.push({ $unwind: this.defaultUnwind });
        }

        const aggr = typeof this.aggregation === "function" ? await this.aggregation(req) : this.aggregation;
        if (this.autoApplyFilter && req.body.filter && typeof req.body.filter === "object") {
            if (this.autoApplyFilter === "begin") {
                return [...prefix, { $match: { ...(await this.getFilterMatch(req, req.body.filter)) } }, ...aggr];
            } else if (this.autoApplyFilter === "end") {
                return [...prefix, ...aggr, { $match: { ...(await this.getFilterMatch(req, req.body.filter)) } }];
            }
        } else if (this.autoApplySearch && req.body.search && typeof req.body.search === "object") {
            if (this.autoApplySearch === "begin") {
                return [...prefix, { $match: { ...(await this.getFilterMatch(req, req.body.search)) } }, ...aggr];
            } else if (this.autoApplySearch === "end") {
                return [...prefix, ...aggr, { $match: { ...(await this.getFilterMatch(req, req.body.search)) } }];
            }
        }

        if (prefix && prefix.length > 0) {
            return [...prefix, ...aggr];
        }
        return aggr;
    }

    async getSubAggregation(req: Request) {
        return typeof this.subAggregation === "function" ? await this.subAggregation(req) : this.subAggregation;
    }

    async getCollection(req: Request) {
        if (this.collection && typeof this.collection === "function") {
            return await this.collection(req);
        }
        return this.collection;
    }

    async getData(req: Request) {
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
        const results = await connection.client
            .db(null)
            .collection(await this.getCollection(req))
            .aggregate(aggr, {
                collation: {
                    locale: "de",
                    strength: 2,
                },
            })
            .toArray();

        const statsGroup: any = { $group: { _id: null, count: { $sum: 1 } } };
        if (req.body.sums && Object.keys(req.body.sums).length > 0) {
            for (let key in req.body.sums) {
                if (req.body.sums[key] && req.body.sums[key].mapping) {
                    statsGroup.$group["sum_" + req.body.sums[key].mapping] = { $sum: "$" + req.body.sums[key].mapping };
                }
            }
        }

        const stats = await connection.client
            .db(null)
            .collection(await this.getCollection(req))
            .aggregate([...(aggregationStats ? aggregationStats : []), statsGroup])
            .toArray();

        if (this.onRow || this.onAttributes) {
            for (let i in results) {
                if (this.onRow) {
                    results[i] = await this.onRow(results[i]);
                }

                if (this.onAttributes) {
                    results[i].__cellattr = await this.onAttributes(results[i]);
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
                                ? NumericFunctions.numberFormat(stats[0]["sum_" + req.body.sums[key].mapping]) +
                                  (req.body.sums[key].suffix ? req.body.sums[key].suffix : "")
                                : undefined,
                    };
                }
            }
        }

        return {
            page: page,
            max_entries: stats && stats[0] && stats[0].count ? stats[0].count : 0,
            total_pages: stats && stats[0] && stats[0].count > 0 ? Math.ceil(stats[0].count / perPage) : 0,
            per_page: perPage,
            entries: results,
            sums: sums,
        };
    }

    async getTotalData(req: Request) {
        const aggregation: any = [];
        const aggregationDef = await this.getAggregation(req);

        if (aggregationDef && aggregationDef.length > 0) {
            for (let entry of aggregationDef) {
                if (entry.skipStats) {
                    delete entry.skipStats;
                    aggregation.push(entry);
                }
            }
        }

        const connection = await DBConnection.getConnection();
        return await connection.client
            .db(null)
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
                value = false;
            }
        } else {
            if (options && options.regex) {
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
            if (filterEl.type === "boolean") {
                if ((typeof valueClean === "boolean" && valueClean) || (valueClean && valueClean.toString() === "true")) {
                    out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] = true;
                    continue;
                }
            }

            // Handle integer/float range
            if ((filterEl.type === "integer-range" || filterEl.type === "float-range") && valueClean !== undefined) {
                if (valueClean.indexOf("-") > 0) {
                    const range = valueClean.split("-");
                    const min = range[0].toString().replace(",", ".");
                    const max = range[1].toString().replace(",", ".");

                    out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] = {
                        $gte: filterEl.type === "float-range" ? parseFloat(min) : parseInt(min),
                        $lte: filterEl.type === "float-range" ? parseFloat(max) : parseInt(max),
                    };
                } else {
                    out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] =
                        filterEl.type === "float-range" ? parseFloat(valueClean.toString().replace(",", ".")) : parseInt(valueClean);
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
                    value = this.formatFilterEntryVal(entry, filterEl, { regex: filterEl && filterEl.regex ? true : false });
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
                    value = value === true || value === 1 || value.toString() === "1" || value.toString() === "true" ? true : false;
                }
            }

            if (value !== undefined) {
                out[filterEl && filterEl.mapping && filterEl.mapping.trim() !== "" ? filterEl.mapping : key] = value;
            }
        }
        return out;
    }
}
