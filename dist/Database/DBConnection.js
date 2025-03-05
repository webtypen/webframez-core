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
exports.DBConnection = void 0;
// @ts-ignore
const Config_1 = require("../Config");
const DBDrivers_1 = require("./DBDrivers");
class DBConnectionFacade {
    constructor() {
        this.connections = {};
    }
    getConnectionConfig(connection) {
        const dbconfig = Config_1.Config.get("database");
        if (!dbconfig) {
            throw new Error("Missing database-config ...");
        }
        if (!connection) {
            connection = dbconfig.defaultConnection;
        }
        if (!connection || !dbconfig || !dbconfig.connections || !dbconfig.connections[connection]) {
            throw new Error("No connection given ...");
        }
        return dbconfig.connections[connection];
    }
    getConnectionDriver(connection) {
        const config = this.getConnectionConfig(connection);
        if (!config || !config["driver"]) {
            return null;
        }
        const driverClass = DBDrivers_1.DBDrivers.get(config["driver"]);
        const driver = new driverClass();
        driver.setConfig(config);
        return driver;
    }
    getConnection(connectionName) {
        return __awaiter(this, void 0, void 0, function* () {
            const dbconfig = Config_1.Config.get("database");
            if (!dbconfig) {
                throw new Error("Missing database-config ...");
            }
            if (!connectionName) {
                connectionName = dbconfig.defaultConnection;
            }
            if (!connectionName) {
                return null;
            }
            if (this.connections[connectionName] && this.connections[connectionName].driver) {
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
    execute(data, connectionName, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield this.getConnection(connectionName);
            return yield connection.driver.execute(connection.client, data, options);
        });
    }
    getDriver(connectionName) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield this.getConnection(connectionName);
            return connection.driver;
        });
    }
    objectId(val, connectionName, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (options && options.noExceptions) {
                try {
                    const connection = yield this.getConnection(connectionName);
                    return yield connection.driver.objectId(val);
                }
                catch (e) {
                    console.error(e);
                }
                return null;
            }
            const connection = yield this.getConnection(connectionName);
            return yield connection.driver.objectId(val);
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
