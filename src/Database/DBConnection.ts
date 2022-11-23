import { DBDrivers } from "./DBDriver";
// @ts-ignore
import dbconfig from "../../../../../config/database";
import { QueryBuilder } from "./QueryBuilder";

class DBConnectionFacade {
  connections: { [key: string]: any } = {};

  getConnectionConfig(connection: string) {
    if (!connection) {
      connection = dbconfig.defaultConnection;
    }

    if (
      !connection ||
      !dbconfig ||
      !dbconfig.connections ||
      !dbconfig.connections[connection as keyof {}]
    ) {
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
    if (!connectionName) {
      connectionName = dbconfig.defaultConnection;
    }

    if (!connectionName) {
      return null;
    }

    if (
      this.connections[connectionName] &&
      this.connections[connectionName].driver
    ) {
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
    const data = await connection.driver.handleQueryBuilder(
      connection.client,
      query
    );

    if (options && options.raw) {
      return data;
    }

    if (!data) {
      return null;
    }

    // @ToDo: Model-Mapping
    return data;
  }

  async execute(data: any, connectionName?: string) {
    const connection = await this.getConnection(connectionName);

    return await connection.driver.execute(connection.client, data);
  }

  async getDriver(connectionName?: string) {
    const connection = await this.getConnection(connectionName);
    return connection.driver;
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
