export declare class QueryBuilder {
    database: string | null;
    query: any[];
    queryTable: string;
    mode: string;
    modelMapping: null;
    setModelMapping(model?: any | null): void;
    table(table: string): void;
    where(column: any, operator: any, value: any): void;
    get(options?: any): Promise<any>;
    first(options?: any): Promise<any>;
    delete(options?: {
        mode: string;
    }): Promise<boolean>;
}
