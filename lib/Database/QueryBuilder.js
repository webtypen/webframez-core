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
        this.mode = "get";
        this.modelMapping = null;
    }
    setModelMapping(model) {
        this.modelMapping = model;
    }
    table(table) {
        this.queryTable = table;
    }
    where(column, operator, value) {
        this.query.push({
            type: "where",
            column: column,
            operator: operator,
            value: value,
        });
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
