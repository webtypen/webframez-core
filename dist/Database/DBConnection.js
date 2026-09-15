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
            throw new Error("No database driver configured.");
        }
        const driverClass = DBDrivers_1.DBDrivers.get(config["driver"]);
        if (!driverClass)
            throw new Error(`Database driver "${config["driver"]}" is not registered. Install and register a driver before using database features.`);
        const driver = new driverClass();
        driver.setConfig(config);
        return driver;
    }
    /** Resolves ID handling without opening a connection. Core import stays side-effect free. */
    getIdAdapter(connectionName) {
        var _a, _b;
        const name = connectionName || ((_a = Config_1.Config.get("database")) === null || _a === void 0 ? void 0 : _a.defaultConnection);
        const driver = (name && ((_b = this.connections[name]) === null || _b === void 0 ? void 0 : _b.driver)) || this.getConnectionDriver(connectionName);
        const adapter = driver.idAdapter;
        if (!adapter)
            throw new Error("This database driver does not implement ID handling.");
        return adapter;
    }
    documentStore(connection) {
        var _a;
        if (typeof ((_a = connection === null || connection === void 0 ? void 0 : connection.driver) === null || _a === void 0 ? void 0 : _a.documentStore) !== "function") {
            throw new Error("The configured database driver does not support document queries. Update the driver to use this feature.");
        }
        return connection.driver.documentStore(connection.client);
    }
    getDocumentStore(connectionName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.documentStore(yield this.getConnection(connectionName));
        });
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
                throw new Error("No default database connection configured.");
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
            const mapping = query.modelMapping;
            const model = typeof mapping === "function" ? new mapping() : mapping;
            const connection = yield this.getConnection(model === null || model === void 0 ? void 0 : model.__connection);
            const data = yield connection.driver.handleQueryBuilder(connection.client, query);
            if (options && options.raw) {
                return data;
            }
            if (data === null || data === undefined) {
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
    // Preserve the existing driver-defined return type for Model.objectId consumers.
    objectId(val, connectionName, options) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return this.getIdAdapter(connectionName).create(val);
            }
            catch (error) {
                if (!(options === null || options === void 0 ? void 0 : options.noExceptions))
                    throw error;
                return null;
            }
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
