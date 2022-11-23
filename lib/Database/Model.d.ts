import { QueryBuilder } from "./QueryBuilder";
export declare class Model {
    [key: string]: any | undefined;
    __primaryKey: string;
    __table: string;
    __connection: string | undefined;
    __hidden: string[];
    __unmapped: string[];
    __unmappedSystem: string[];
    /**
     * Creates a new query-builder object and adds a where-clause
     * @param column
     * @param operator
     * @param value
     * @returns QueryBulder
     */
    static where(column: any, operator: any, value: any): QueryBuilder;
    /**
     * Executes a database-aggregation (mostly used by no-sql connections)
     * @param aggregation
     * @returns any
     */
    static aggregate(aggregation: any): Promise<any>;
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
