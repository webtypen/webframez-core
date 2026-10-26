/** Converts DataBuilder/DataSchema field definitions into an extensible column catalog. */
export declare class DatatableSchemaColumns {
    static fromSchema(schema: Record<string, any>, options?: {
        prefix?: string;
        labelPrefix?: string;
        prepare?: (column: Record<string, any>, field: any, path: string) => Record<string, any> | null;
    }): Record<string, any>;
}
