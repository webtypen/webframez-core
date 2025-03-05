import { Request } from "../Router/Request";
export declare class Datatable {
    collection: string | Function;
    aggregation: {
        [key: string]: any;
    } | Function | null;
    subAggregation: {
        [key: string]: any;
    } | Function | null;
    filter: {
        [key: string]: any;
    } | Function | null;
    columns: {
        [key: string]: any;
    } | Function | null;
    onPressLink: string | Function | null;
    exports: any | null;
    perPage: number;
    onRow?: Function;
    onAttributes?: Function;
    getInit(req: Request): Promise<any>;
    getAggregation(req: Request): Promise<any>;
    getSubAggregation(req: Request): Promise<any>;
    getCollection(req: Request): Promise<any>;
    getData(req: Request): Promise<{
        page: number;
        max_entries: any;
        total_pages: number;
        entries: any;
        sums: any;
    }>;
    getTotalData(req: Request): Promise<any>;
    getFilter(req: Request): Promise<any>;
    getColumns(req: Request): Promise<any>;
    getOnPressLink(req: Request): Promise<any>;
    private formatFilterEntryVal;
    getFilterMatch(req: Request, searchOrFilter: any): Promise<any>;
}
