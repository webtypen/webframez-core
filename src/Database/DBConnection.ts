import type { DatabaseIdAdapter, DocumentDatabase } from "./DatabaseAdapter";
// @ts-ignore
import { Config } from "../Config";
import { DBDrivers } from "./DBDrivers";
import { QueryBuilder } from "./QueryBuilder";

type ObjectIDType = {
    noExceptions?: Boolean;
};

class DBConnectionFacade {
    connections: { [key: string]: any } = {};

    getConnectionConfig(connection?: string) {
        const dbconfig = Config.get("database");

        if (!dbconfig) {
            throw new Error("Missing database-config ...");
        }

        if (!connection) {
            connection = dbconfig.defaultConnection;
        }

        if (!connection || !dbconfig || !dbconfig.connections || !dbconfig.connections[connection as keyof {}]) {
            throw new Error("No connection given ...");
        }

        return dbconfig.connections[connection as keyof {}];
    }

    getConnectionDriver(connection?: string) {
        const config = this.getConnectionConfig(connection);
        if (!config || !config["driver"]) {
            throw new Error("No database driver configured.");
        }

        const driverClass = DBDrivers.get(config["driver"]);
        if (!driverClass) throw new Error(`Database driver "${config["driver"]}" is not registered. Install and register a driver before using database features.`);
        const driver = new driverClass();
        driver.setConfig(config);
        return driver;
    }

    /** Resolves ID handling without opening a connection. Core import stays side-effect free. */
    getIdAdapter(connectionName?: string): DatabaseIdAdapter {
        const name = connectionName || Config.get("database")?.defaultConnection;
        const driver = (name && this.connections[name]?.driver) || this.getConnectionDriver(connectionName);
        const adapter = driver.idAdapter;
        if (!adapter) throw new Error("This database driver does not implement ID handling.");
        return adapter;
    }

    documentStore(connection: any): DocumentDatabase {
        if (typeof connection?.driver?.documentStore !== "function") {
            throw new Error("The configured database driver does not support document queries. Update the driver to use this feature.");
        }
        return connection.driver.documentStore(connection.client);
    }

    async getDocumentStore(connectionName?: string): Promise<DocumentDatabase> {
        return this.documentStore(await this.getConnection(connectionName));
    }

    async getConnection(connectionName?: string) {
        const dbconfig = Config.get("database");

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
        const client = await driver.connect();

        this.connections[connectionName] = {
            driver: driver,
            client: client,
        };

        return this.connections[connectionName];
    }

    async runQuery(query: QueryBuilder, options?: { [name: string]: any }) {
        const mapping: any = query.modelMapping;
        const model = typeof mapping === "function" ? new mapping() : mapping;
        const connection = await this.getConnection(model?.__connection);
        const data = await connection.driver.handleQueryBuilder(connection.client, query);

        if (options && options.raw) {
            return data;
        }

        if (data === null || data === undefined) {
            return null;
        }

        // @ToDo: Model-Mapping
        return data;
    }

    async execute(data: any, connectionName?: string, options?: any) {
        const connection = await this.getConnection(connectionName);

        return await connection.driver.execute(connection.client, data, options);
    }

    async getDriver(connectionName?: string) {
        const connection = await this.getConnection(connectionName);
        return connection.driver;
    }

    // Preserve the existing driver-defined return type for Model.objectId consumers.
    async objectId(val?: any, connectionName?: string, options?: ObjectIDType): Promise<any> {
        try {
            return this.getIdAdapter(connectionName).create(val);
        } catch (error) {
            if (!options?.noExceptions) throw error;
            return null;
        }
    }

    mapDataToModel(model: any, data: any) {
        const obj = new model();
        if (data) {
            for (let i in data) {
                obj[i] = data[i];
            }
        }
        return obj;
    }
}

export const DBConnection = new DBConnectionFacade();
