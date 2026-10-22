import { QueryBuilder } from "./QueryBuilder";
type ObjectIDType = {
    noExceptions?: Boolean;
};
export declare function hasOne(modelGetter: () => any, foreignKey: string, localKey?: string, queryFunction?: Function): (target: any, propertyKey: string, v2?: any) => void;
export declare function hasMany(modelGetter: () => any, foreignKey: string, localKey?: string, queryFunction?: Function): (target: any, propertyKey: string) => void;
export declare function hasManyArray(modelGetter: () => any, localArrayKey: string, foreignKey?: string, queryFunction?: Function): (target: any, propertyKey: string) => void;
export declare class Model {
    [key: string]: any | undefined;
    __primaryKey: string;
    __table: string;
    __connection: string | undefined;
    __hidden: string[];
    __dependencies: any;
    __unmapped: string[];
    __unmappedSystem: string[];
    static objectId(val?: any, options?: ObjectIDType): Promise<any>;
    objectId(val?: any, options?: ObjectIDType): Promise<any>;
    /** Atomically claim or update one matching record through the selected document driver.
     * Filter and update use the document adapter's native operators. Returns the updated model.
     * Like update(), this low-level operation does not invoke schema form hooks.
     */
    static findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>): Promise<any>;
    /** Conditionally update matching documents without read-modify-save races or form hooks. */
    static updateManyWhere(filter: Record<string, any>, update: Record<string, any>, options?: any): Promise<any>;
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
    static aggregate(aggregation: any, options?: any, collection?: string): Promise<any>;
    buildRelationship(model: any, foreignKey: string, localKey?: string): any;
    buildArrayRelationship(model: any, localArrayKey: string, foreignKey?: string): any;
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
     * Update model-data
     * @returns Model
     */
    update(updateData: {
        [key: string]: any;
    }): Promise<void>;
    /**
     * Deletes the object from the database
     * @returns boolean
     */
    delete(): Promise<boolean>;
}
export {};
