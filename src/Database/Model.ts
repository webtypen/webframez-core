import { DBConnection } from "./DBConnection";
import { QueryBuilder } from "./QueryBuilder";

export class Model {
  [key: string]: any | undefined; // allow-custom-properties
  __primaryKey = "_id";
  __table: string = "";
  __connection: string | undefined = undefined;
  __hidden: string[] = [];
  __unmapped: string[] = [];
  __unmappedSystem: string[] = [
    "__primaryKey",
    "__table",
    "__connection",
    "__unmapped",
    "__unmappedSystem",
    "__is_deleted",
    "__hidden",
  ];

  /**
   * Creates a new query-builder object and adds a where-clause
   * @param column
   * @param operator
   * @param value
   * @returns QueryBulder
   */
  static where(column: any, operator: any, value: any): QueryBuilder {
    const model = new this();
    const queryBuilder = new QueryBuilder();
    queryBuilder.setModelMapping(this);
    queryBuilder.table(model.__table);
    queryBuilder.where(column, operator, value);

    return queryBuilder;
  }
  
  /**
   * Creates a new query-builder object and adds a orderBy-clause
   * @param column
   * @param sort
   * @returns QueryBulder
   */
  static orderBy(column: any, sort: any): QueryBuilder {
    const model = new this();
    const queryBuilder = new QueryBuilder();
    queryBuilder.setModelMapping(this);
    queryBuilder.table(model.__table);
    queryBuilder.orderBy(column, sort);

    return queryBuilder;
  }
  
  /**
   * Creates a new query-builder object and executes first()
   * @param options?
   * @returns QueryBulder
   */
  static async first(options?: any): QueryBuilder {
    const model = new this();
    const queryBuilder = new QueryBuilder();
    queryBuilder.setModelMapping(this);
    queryBuilder.table(model.__table);

    return await queryBuilder.first(options);
  }
  
  /**
   * Creates a new query-builder object and executes get()
   * @param options?
   * @returns QueryBulder
   */
  static async get(options?: any): QueryBuilder {
    const model = new this();
    const queryBuilder = new QueryBuilder();
    queryBuilder.setModelMapping(this);
    queryBuilder.table(model.__table);

    return await queryBuilder.get(options);
  }
  
  /**
   * Creates a new query-builder object and executes paginate()
   * @param count
   * @param options?
   * @returns QueryBulder
   */
  static async paginate(count: number, options?: any): QueryBuilder {
    const model = new this();
    const queryBuilder = new QueryBuilder();
    queryBuilder.setModelMapping(this);
    queryBuilder.table(model.__table);

    return await queryBuilder.paginate(count, options);
  }

  /**
   * Executes a database-aggregation (mostly used by no-sql connections)
   * @param aggregation
   * @returns any
   */
  static async aggregate(aggregation: any) {
    const model = new this();
    return await DBConnection.execute(
      {
        type: "aggregation",
        table: model.__table,
        aggregation: aggregation,
      },
      model.__connection
    );
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
      if (
        !this.__unmapped.includes(i) &&
        !this.__unmappedSystem.includes(i) &&
        !this.__hidden.includes(i)
      ) {
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
