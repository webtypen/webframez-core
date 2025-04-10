import { DBConnection } from "./DBConnection";
import { QueryBuilder } from "./QueryBuilder";

type ObjectIDType = {
    noExceptions?: Boolean;
};

export function hasOne(modelGetter: () => any, foreignKey: string, localKey?: string, queryFunction?: Function) {
    return function (target: any, propertyKey: string, v2?: any) {
        Object.defineProperty(target, propertyKey, {
            value: async function (options?: any) {
                if ((!options || !options.force) && this.__dependencies && this.__dependencies[propertyKey] !== undefined) {
                    return this.__dependencies[propertyKey];
                }

                const model = modelGetter();
                if (!model) {
                    throw new Error(`Model for foreignKey "${foreignKey}" konnte nicht aufgelöst werden.`);
                }

                if (!this.__dependencies) {
                    this.__dependencies = {};
                }

                const query = this.buildRelationship(model, localKey ?? "_id", foreignKey);
                if (queryFunction && typeof queryFunction === "function") {
                    queryFunction(query);
                }

                if (options && options.query) {
                    return query;
                }
                this.__dependencies[propertyKey] = await query.first();
                return this.__dependencies[propertyKey];
            },
            writable: false,
            configurable: true,
        });
    };
}

export function hasMany(modelGetter: () => any, foreignKey: string, localKey?: string, queryFunction?: Function) {
    return function (target: any, propertyKey: string) {
        Object.defineProperty(target, propertyKey, {
            value: async function (options?: any) {
                if ((!options || !options.force) && this.__dependencies && this.__dependencies[propertyKey] !== undefined) {
                    return this.__dependencies[propertyKey];
                }

                const model = modelGetter();
                if (!model) {
                    throw new Error(`Model for foreignKey "${foreignKey}" konnte nicht aufgelöst werden.`);
                }

                if (!this.__dependencies) {
                    this.__dependencies = {};
                }

                const query = this.buildRelationship(model, foreignKey, localKey);
                if (queryFunction && typeof queryFunction === "function") {
                    queryFunction(query);
                }

                if (options && options.query) {
                    return query;
                }
                this.__dependencies[propertyKey] = await query.get();
                return this.__dependencies[propertyKey];
            },
            writable: false,
            configurable: true,
        });
    };
}

export function hasManyArray(modelGetter: () => any, localArrayKey: string, foreignKey?: string, queryFunction?: Function) {
    return function (target: any, propertyKey: string) {
        Object.defineProperty(target, propertyKey, {
            value: async function (options?: any) {
                if ((!options || !options.force) && this.__dependencies && this.__dependencies[propertyKey] !== undefined) {
                    return this.__dependencies[propertyKey];
                }

                const model = modelGetter();
                if (!model) {
                    throw new Error(`Model for foreignKey "${foreignKey}" konnte nicht aufgelöst werden.`);
                }

                if (!this.__dependencies) {
                    this.__dependencies = {};
                }

                const query = this.buildArrayRelationship(model, localArrayKey, foreignKey);
                if (queryFunction && typeof queryFunction === "function") {
                    queryFunction(query);
                }

                if (options && options.query) {
                    return query;
                }
                this.__dependencies[propertyKey] = await query.get();
                return this.__dependencies[propertyKey];
            },
            writable: false,
            configurable: true,
        });
    };
}

export class Model {
    [key: string]: any | undefined; // allow-custom-properties
    __primaryKey = "_id";
    __table: string = "";
    __connection: string | undefined = undefined;
    __hidden: string[] = [];
    __dependencies: any = {};
    __unmapped: string[] = [];
    __unmappedSystem: string[] = [
        "__primaryKey",
        "__table",
        "__connection",
        "__unmapped",
        "__unmappedSystem",
        "__is_deleted",
        "__hidden",
        "__dependencies",
    ];

    static async objectId(val?: any, options?: ObjectIDType) {
        const model = new this();
        return await DBConnection.objectId(val, model.__connection, options);
    }

    async objectId(val?: any, options?: ObjectIDType) {
        return await DBConnection.objectId(val, this.__connection, options);
    }

    /**
     * Creates a new query-builder object and adds a where-clause
     * @param column
     * @param operator
     * @param value
     * @returns QueryBulder
     */
    static where(column: any, operator: any, value: any, collection?: string): QueryBuilder {
        const model = collection ? null : new this();
        const queryBuilder = new QueryBuilder();
        queryBuilder.setModelMapping(this);
        if (model) {
            queryBuilder.table(model.__table);
        } else if (collection) {
            queryBuilder.table(collection);
        }
        queryBuilder.where(column, operator, value);

        return queryBuilder;
    }

    /**
     * Creates a new query-builder object and adds a orderBy-clause
     * @param column
     * @param sort
     * @returns QueryBulder
     */
    static orderBy(column: any, sort: any, collection?: string): QueryBuilder {
        const model = collection ? null : new this();
        const queryBuilder = new QueryBuilder();
        queryBuilder.setModelMapping(this);
        if (model) {
            queryBuilder.table(model.__table);
        } else if (collection) {
            queryBuilder.table(collection);
        }
        queryBuilder.orderBy(column, sort);

        return queryBuilder;
    }

    /**
     * Creates a new query-builder object and executes first()
     * @param options?
     * @returns QueryBulder
     */
    static async first(options?: any, collection?: string) {
        const model = collection ? null : new this();
        const queryBuilder = new QueryBuilder();
        queryBuilder.setModelMapping(this);
        if (model) {
            queryBuilder.table(model.__table);
        } else if (collection) {
            queryBuilder.table(collection);
        }

        return await queryBuilder.first(options);
    }

    /**
     * Creates a new query-builder object and executes get()
     * @param options?
     * @returns QueryBulder
     */
    static async get(options?: any, collection?: string) {
        const model = collection ? null : new this();
        const queryBuilder = new QueryBuilder();
        queryBuilder.setModelMapping(this);
        if (model) {
            queryBuilder.table(model.__table);
        } else if (collection) {
            queryBuilder.table(collection);
        }

        return await queryBuilder.get(options);
    }

    /**
     * Creates a new query-builder object and executes paginate()
     * @param count
     * @param options?
     * @returns QueryBulder
     */
    static async paginate(count: number, options?: any, collection?: string) {
        const model = collection ? null : new this();
        const queryBuilder = new QueryBuilder();
        queryBuilder.setModelMapping(this);
        if (model) {
            queryBuilder.table(model.__table);
        } else if (collection) {
            queryBuilder.table(collection);
        }

        return await queryBuilder.paginate(count, options);
    }

    /**
     * Executes a database-aggregation (mostly used by no-sql connections)
     * @param aggregation
     * @returns any
     */
    static async aggregate(aggregation: any, options?: any, collection?: string) {
        const model = new this();
        return await DBConnection.execute(
            {
                type: "aggregation",
                table: collection ? collection : model ? model.__table : undefined,
                aggregation: aggregation,
            },
            model.__connection
        );
    }

    buildRelationship(model: any, foreignKey: string, localKey?: string): any {
        return model.where(foreignKey, "=", this[localKey ?? "_id"]);
    }

    buildArrayRelationship(model: any, localArrayKey: string, foreignKey?: string): any {
        return model.where(foreignKey ?? "_id", "=", { $in: this[localArrayKey] });
    }

    /**
     * Returns the model-data without system- and unmapped-fields (new js-object)
     * @returns object
     */
    getModelData(): object {
        const out: { [key: string]: any } = {};
        for (let i in this) {
            if (!this.__unmapped.includes(i) && !this.__unmappedSystem.includes(i)) {
                out[i] = this[i];
            }
        }
        return out;
    }

    /**
     * Returns the model-data without system-, unmapped- and hidden-fields (new js-object)
     * @returns object
     */
    toArray(): object {
        const out: { [key: string]: any } = {};
        for (let i in this) {
            if (!this.__unmapped.includes(i) && !this.__unmappedSystem.includes(i) && !this.__hidden.includes(i)) {
                out[i] = this[i];
            }
        }
        return out;
    }

    /**
     * Saves the object in the database
     * @returns Model
     */
    async save() {
        let status = null;
        if (this[this.__primaryKey] !== undefined && this[this.__primaryKey]) {
            // Update
            status = await DBConnection.execute({
                type: "updateOne",
                table: this.__table,
                primaryKey: this.__primaryKey,
                filter: { [this.__primaryKey]: this[this.__primaryKey] },
                data: this.getModelData(),
            });
        } else {
            // Insert
            status = await DBConnection.execute({
                type: "insertOne",
                table: this.__table,
                data: this.getModelData(),
            });
        }

        // onModelSave
        const driver = await DBConnection.getDriver(this.__connection);
        return driver.onModelSave(this, status);
    }

    /**
     * Deletes the object from the database
     * @returns boolean
     */
    async delete() {
        if (!this[this.__primaryKey]) {
            return false;
        }

        const queryBuilder = new QueryBuilder();
        queryBuilder.setModelMapping(this);
        queryBuilder.table(this.__table);
        queryBuilder.where(this.__primaryKey, "=", this[this.__primaryKey]);
        await queryBuilder.delete({ mode: "deleteOne" });

        this.__is_deleted = true;

        return true;
    }
}
