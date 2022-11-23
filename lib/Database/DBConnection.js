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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DBConnection = void 0;
const DBDriver_1 = require("./DBDriver");
// @ts-ignore
const database_1 = __importDefault(require("../../../../../config/database"));
class DBConnectionFacade {
    constructor() {
        this.connections = {};
    }
    getConnectionConfig(connection) {
        if (!connection) {
            connection = database_1.default.defaultConnection;
        }
        if (!connection ||
            !database_1.default ||
            !database_1.default.connections ||
            !database_1.default.connections[connection]) {
            throw new Error("No connection given ...");
        }
        return database_1.default.connections[connection];
    }
    getConnectionDriver(connection) {
        const config = this.getConnectionConfig(connection);
        if (!config || !config["driver"]) {
            return null;
        }
        const driverClass = DBDriver_1.DBDrivers.get(config["driver"]);
        const driver = new driverClass();
        driver.setConfig(config);
        return driver;
    }
    getConnection(connectionName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!connectionName) {
                connectionName = database_1.default.defaultConnection;
            }
            if (!connectionName) {
                return null;
            }
            if (this.connections[connectionName] &&
                this.connections[connectionName].driver) {
                // Use cached connection
                return this.connections[connectionName];
            }
            // Create new connection and cache it
            const driver = this.getConnectionDriver(connectionName);
            const client = yield driver.connect();
            this.connections[connectionName] = {
                driver: driver,
                client: client,
            };
            return this.connections[connectionName];
        });
    }
    runQuery(query, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield this.getConnection();
            const data = yield connection.driver.handleQueryBuilder(connection.client, query);
            if (options && options.raw) {
                return data;
            }
            if (!data) {
                return null;
            }
            // @ToDo: Model-Mapping
            return data;
        });
    }
    execute(data, connectionName) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield this.getConnection(connectionName);
            return yield connection.driver.execute(connection.client, data);
        });
    }
    getDriver(connectionName) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield this.getConnection(connectionName);
            return connection.driver;
        });
    }
    mapDataToModel(model, data) {
        const obj = new model();
        if (data) {
            for (let i in data) {
                obj[i] = data[i];
            }
        }
        return obj;
    }
}
exports.DBConnection = new DBConnectionFacade();
