/** An ID is owned by the selected driver, not by the core package. */
export type DatabaseId = string | number | {
    toString(): string;
};
export interface DatabaseIdAdapter {
    create(value?: unknown): DatabaseId;
    normalize(value: unknown): DatabaseId | null;
    isValid(value: unknown): boolean;
    equals(left: unknown, right: unknown): boolean;
}
export interface DocumentCursor {
    toArray(): Promise<any[]>;
    sort(sort: any): DocumentCursor;
    skip(count: number): DocumentCursor;
    limit(count: number): DocumentCursor;
}
/** Optional document-query capability. Filters, updates and aggregation stages use
 * the framework's document query vocabulary. A driver implements or translates it;
 * unsupported drivers must reject the capability rather than emulate atomicity. */
export interface DocumentCollection {
    find(filter?: any, options?: any): DocumentCursor;
    findOne(filter: any, options?: any): Promise<any | null>;
    aggregate(stages: any[], options?: any): DocumentCursor;
    countDocuments(filter?: any, options?: any): Promise<number>;
    insertOne(document: any, options?: any): Promise<any>;
    insertMany(documents: any[], options?: any): Promise<any>;
    updateOne(filter: any, update: any, options?: any): Promise<any>;
    updateMany(filter: any, update: any, options?: any): Promise<any>;
    replaceOne(filter: any, replacement: any, options?: any): Promise<any>;
    deleteOne(filter: any, options?: any): Promise<any>;
    deleteMany(filter: any, options?: any): Promise<any>;
    /** Atomically selects and updates ONE document; returns the document or null.
     * Never return a driver-specific result wrapper. Queue leases depend on this. */
    findOneAndUpdate(filter: any, update: any, options?: {
        sort?: any;
        upsert?: boolean;
        returnDocument?: "before" | "after";
    }): Promise<any | null>;
}
export interface DocumentDatabase {
    collection(name: string): DocumentCollection;
}
