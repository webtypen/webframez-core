export declare class QueryBuilder {
    database: string | null;
    query: any[];
    queryTable: string;
    sort: any[];
    limitCount: number | null;
    offsetCount: number | null;
    mode: string;
    modelMapping: null;
    setModelMapping(model?: any | null): this;
    table(table: string): this;
    where(column: any, operator: any, value: any): this;
    orderBy(column: any, sort: any): this;
    take(count: number | null): this;
    offset(count: number | null): this;
    get(options?: any): Promise<any>;
    first(options?: any): Promise<any>;
    paginate(count: number, options?: any): Promise<any>;
    delete(options?: {
        mode: string;
    }): Promise<boolean>;
}
