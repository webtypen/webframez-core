"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
const DBConnection_1 = require("./DBConnection");
const QueryBuilder_1 = require("./QueryBuilder");
class Model {
    constructor() {
        this.__primaryKey = "_id";
        this.__table = "";
        this.__connection = undefined;
        this.__hidden = [];
        this.__unmapped = [];
        this.__unmappedSystem = [
            "__primaryKey",
            "__table",
            "__connection",
            "__unmapped",
            "__unmappedSystem",
            "__is_deleted",
            "__hidden",
        ];
    }
    /**
     * Creates a new query-builder object and adds a where-clause
     * @param column
     * @param operator
     * @param value
     * @returns QueryBulder
     */
    static where(column, operator, value) {
        const model = new this();
        const queryBuilder = new QueryBuilder_1.QueryBuilder();
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
    static orderBy(column, sort) {
        const model = new this();
        const queryBuilder = new QueryBuilder_1.QueryBuilder();
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
    static first(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new this();
            const queryBuilder = new QueryBuilder_1.QueryBuilder();
            queryBuilder.setModelMapping(this);
            queryBuilder.table(model.__table);
            return yield queryBuilder.first(options);
        });
    }
    /**
     * Creates a new query-builder object and executes get()
     * @param options?
     * @returns QueryBulder
     */
    static get(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new this();
            const queryBuilder = new QueryBuilder_1.QueryBuilder();
            queryBuilder.setModelMapping(this);
            queryBuilder.table(model.__table);
            return yield queryBuilder.get(options);
        });
    }
    /**
     * Creates a new query-builder object and executes paginate()
     * @param count
     * @param options?
     * @returns QueryBulder
     */
    static paginate(count, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new this();
            const queryBuilder = new QueryBuilder_1.QueryBuilder();
            queryBuilder.setModelMapping(this);
            queryBuilder.table(model.__table);
            return yield queryBuilder.paginate(count, options);
        });
    }
    /**
     * Executes a database-aggregation (mostly used by no-sql connections)
     * @param aggregation
     * @returns any
     */
    static aggregate(aggregation) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new this();
            return yield DBConnection_1.DBConnection.execute({
                type: "aggregation",
                table: model.__table,
                aggregation: aggregation,
            }, model.__connection);
        });
    }
    /**
     * Returns the model-data without system- and unmapped-fields (new js-object)
     * @returns object
     */
    getModelData() {
        const out = {};
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
    toArray() {
        const out = {};
        for (let i in this) {
            if (!this.__unmapped.includes(i) &&
                !this.__unmappedSystem.includes(i) &&
                !this.__hidden.includes(i)) {
                out[i] = this[i];
            }
        }
        return out;
    }
    /**
     * Saves the object in the database
     * @returns Model
     */
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            let status = null;
            if (this[this.__primaryKey] !== undefined && this[this.__primaryKey]) {
                // Update
                status = yield DBConnection_1.DBConnection.execute({
                    type: "updateOne",
                    table: this.__table,
                    primaryKey: this.__primaryKey,
                    filter: { [this.__primaryKey]: this[this.__primaryKey] },
                    data: this.getModelData(),
                });
            }
            else {
                // Insert
                status = yield DBConnection_1.DBConnection.execute({
                    type: "insertOne",
                    table: this.__table,
                    data: this.getModelData(),
                });
            }
            // onModelSave
            const driver = yield DBConnection_1.DBConnection.getDriver(this.__connection);
            return driver.onModelSave(this, status);
        });
    }
    /**
     * Deletes the object from the database
     * @returns boolean
     */
    delete() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this[this.__primaryKey]) {
                return false;
            }
            const queryBuilder = new QueryBuilder_1.QueryBuilder();
            queryBuilder.setModelMapping(this);
            queryBuilder.table(this.__table);
            queryBuilder.where(this.__primaryKey, "=", this[this.__primaryKey]);
            yield queryBuilder.delete({ mode: "deleteOne" });
            this.__is_deleted = true;
            return true;
        });
    }
}
exports.Model = Model;
