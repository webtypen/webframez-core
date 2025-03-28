// @ts-ignore
import { Config } from "../Config";
import { DBDrivers } from "./DBDrivers";
import { QueryBuilder } from "./QueryBuilder";

type ObjectIDType = {
    noExceptions?: Boolean;
};

class DBConnectionFacade {
    connections: { [key: string]: any } = {};

    getConnectionConfig(connection: string) {
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

    getConnectionDriver(connection: string) {
        const config = this.getConnectionConfig(connection);
        if (!config || !config["driver"]) {
            return null;
        }

        const driverClass = DBDrivers.get(config["driver"]);
        const driver = new driverClass();
        driver.setConfig(config);
        return driver;
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
            return null;
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
        const connection = await this.getConnection();
        const data = await connection.driver.handleQueryBuilder(connection.client, query);

        if (options && options.raw) {
            return data;
        }

        if (!data) {
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

    async objectId(val?: any, connectionName?: string, options?: ObjectIDType) {
        if (options && options.noExceptions) {
            try {
                const connection = await this.getConnection(connectionName);
                return await connection.driver.objectId(val);
            } catch (e) {
                console.error(e);
            }
            return null;
        }

        const connection = await this.getConnection(connectionName);
        return await connection.driver.objectId(val);
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
