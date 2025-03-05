declare class DatatableRegistryWrapper {
    tables: any;
    register(key: string, tableClass: any): this;
    registerMany(data: any): this;
    getTable(key: string): any;
}
export declare const DatatableRegistry: DatatableRegistryWrapper;
export {};
