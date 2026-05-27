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
    onInit?: Function;
    onData?: Function;
    autoApplyFilter: "begin" | "end" | null;
    autoApplySearch: "begin" | "end" | null;
    logAggregation: boolean;
    defaultUnwind?: string | null;
    disablePerPageConfig: boolean;
    selectable: boolean;
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
    } | null;
    getInit(req: Request): Promise<any>;
    getSelectableFunctionsDef(req: Request): Promise<{
        label: string;
        icon: string | undefined;
        confirmMessage: string | undefined;
        confirmOptions: any;
        apiFunction: string;
        apiFunctionPayload: any;
    }[] | null>;
    getAggregation(req: Request): Promise<any>;
    getSubAggregation(req: Request): Promise<any>;
    getCollection(req: Request): Promise<any>;
    getData(req: Request): Promise<{
        page: number;
        max_entries: any;
        total_pages: number;
        per_page: number;
        entries: any;
        sums: any;
    }>;
    stats(req: Request): Promise<Array<{
        label: string;
        type: string;
        value: any;
    }>>;
    getTotalData(req: Request): Promise<any>;
    getFilter(req: Request): Promise<any>;
    getColumns(req: Request): Promise<any>;
    getOnPressLink(req: Request): Promise<any>;
    private formatFilterEntryVal;
    getFilterMatch(req: Request, searchOrFilter: any): Promise<any>;
}
