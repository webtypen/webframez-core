import moment from "moment";
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
    onInit?: Function;
    onData?: Function;
    autoApplyFilter: "begin" | "end" | null = "begin";
    autoApplySearch: "begin" | "end" | null = null;
    logAggregation = false;
    defaultUnwind?: string | null = null;
    disablePerPageConfig = false;
    selectable = false;
    selectableFunctions: {
        [key: string]: {
            label: string;
            icon?: string;
            handle: Function;
            isAvailable?: Function;
            payload?: any;
            confirmMessage?: string;
            confirmAttributes?: any;
        };
    } | null = null;

    async getInit(req: Request) {
        const out: any = {
            table: req.body._table,
            selectable: this.selectable ? true : false,
            selectableFunctions: await this.getSelectableFunctionsDef(req),
        };
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

        if (typeof this.onInit === "function") {
            await this.onInit(req, out);
        }
        return out;
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
                confirmAttributes: this.selectableFunctions[key].confirmAttributes,
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

        const aggr = typeof this.aggregation === "function" ? await this.aggregation(req) : this.aggregation;
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
            await this.onData(req, data);
        }
        return data;
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
