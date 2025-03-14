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
        return typeof this.aggregation === "function" ? await this.aggregation(req) : this.aggregation;
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

        const connection = await DBConnection.getConnection();
        const results = await connection.client
            .db(null)
            .collection(await this.getCollection(req))
            .aggregate(
                [
                    ...(aggregation ? aggregation : []),
                    ...(!hasSkip ? [{ $skip: page ? page * this.perPage : 0 }] : []),
                    ...(!hasLimit ? [{ $limit: this.perPage }] : []),
                    ...(subAggregation ? subAggregation : []),
                ],
                {
                    collation: {
                        locale: "de",
                        strength: 2,
                    },
                }
            )
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
            total_pages: stats && stats[0] && stats[0].count > 0 ? Math.ceil(stats[0].count / this.perPage) : 0,
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
    }
}
