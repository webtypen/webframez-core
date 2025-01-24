import { QueryBuilder } from "./QueryBuilder";
type ObjectIDType = {
    noExceptions?: Boolean;
};
export declare class Model {
    [key: string]: any | undefined;
    __primaryKey: string;
    __table: string;
    __connection: string | undefined;
    __hidden: string[];
    __unmapped: string[];
    __unmappedSystem: string[];
    static objectId(val?: any, options?: ObjectIDType): Promise<any>;
    objectId(val?: any, options?: ObjectIDType): Promise<any>;
    /**
     * Creates a new query-builder object and adds a where-clause
     * @param column
     * @param operator
     * @param value
     * @returns QueryBulder
     */
    static where(column: any, operator: any, value: any, collection?: string): QueryBuilder;
    /**
     * Creates a new query-builder object and adds a orderBy-clause
     * @param column
     * @param sort
     * @returns QueryBulder
     */
    static orderBy(column: any, sort: any, collection?: string): QueryBuilder;
    /**
     * Creates a new query-builder object and executes first()
     * @param options?
     * @returns QueryBulder
     */
    static first(options?: any, collection?: string): Promise<any>;
    /**
     * Creates a new query-builder object and executes get()
     * @param options?
     * @returns QueryBulder
     */
    static get(options?: any, collection?: string): Promise<any>;
    /**
     * Creates a new query-builder object and executes paginate()
     * @param count
     * @param options?
     * @returns QueryBulder
     */
    static paginate(count: number, options?: any, collection?: string): Promise<any>;
    /**
     * Executes a database-aggregation (mostly used by no-sql connections)
     * @param aggregation
     * @returns any
     */
    static aggregate(aggregation: any, collection?: string): Promise<any>;
    /**
     * Returns the model-data without system- and unmapped-fields (new js-object)
     * @returns object
     */
    getModelData(): object;
    /**
     * Returns the model-data without system-, unmapped- and hidden-fields (new js-object)
     * @returns object
     */
    toArray(): object;
    /**
     * Saves the object in the database
     * @returns Model
     */
    save(): Promise<any>;
    /**
     * Deletes the object from the database
     * @returns boolean
     */
    delete(): Promise<boolean>;
}
export {};
