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
exports.QueryBuilder = void 0;
const DBConnection_1 = require("./DBConnection");
class QueryBuilder {
    constructor() {
        this.database = null;
        this.query = [];
        this.queryTable = "";
        this.sort = [];
        this.limitCount = null;
        this.offsetCount = null;
        this.mode = "get";
        this.modelMapping = null;
    }
    setModelMapping(model) {
        this.modelMapping = model;
        return this;
    }
    table(table) {
        this.queryTable = table;
        return this;
    }
    where(column, operator, value) {
        this.query.push({
            type: "where",
            column: column,
            operator: operator,
            value: value,
        });
        return this;
    }
    orderBy(column, sort) {
        this.sort.push({
            column: column,
            sort: sort,
        });
        return this;
    }
    take(count) {
        this.limitCount = count;
        return this;
    }
    offset(count) {
        this.offsetCount = count;
        return this;
    }
    get(options) {
        return __awaiter(this, void 0, void 0, function* () {
            this.mode = "get";
            const result = yield DBConnection_1.DBConnection.runQuery(this);
            if (options && options.disableModelMapping) {
                return result && result.length > 0 ? result : null;
            }
            return result && result.length > 0 && this.modelMapping !== null
                ? result.map((el) => DBConnection_1.DBConnection.mapDataToModel(this.modelMapping, el))
                : result && result.length > 0
                    ? result
                    : null;
        });
    }
    first(options) {
        return __awaiter(this, void 0, void 0, function* () {
            this.mode = "first";
            const result = yield DBConnection_1.DBConnection.runQuery(this);
            if (options && options.disableModelMapping) {
                return result ? result : null;
            }
            return result && this.modelMapping !== null
                ? DBConnection_1.DBConnection.mapDataToModel(this.modelMapping, result)
                : null;
        });
    }
    paginate(count, options) {
        return __awaiter(this, void 0, void 0, function* () {
            this.mode = "paginate";
            this.take(count);
            if (options && options.offset !== undefined && options.offset !== null && options.offset !== false) {
                this.offset(parseInt(options.offset));
            }
            else {
                // @ToDo: Load offset from request
                this.offset(null);
            }
            const result = yield DBConnection_1.DBConnection.runQuery(this);
            if (options && options.disableModelMapping) {
                return result && result.length > 0 ? result : null;
            }
            return result && result.length > 0 && this.modelMapping !== null
                ? result.map((el) => DBConnection_1.DBConnection.mapDataToModel(this.modelMapping, el))
                : result && result.length > 0
                    ? result
                    : null;
        });
    }
    delete(options) {
        return __awaiter(this, void 0, void 0, function* () {
            this.mode =
                options && options.mode === "deleteOne" ? "deleteOne" : "delete";
            yield DBConnection_1.DBConnection.runQuery(this);
            return true;
        });
    }
}
exports.QueryBuilder = QueryBuilder;
