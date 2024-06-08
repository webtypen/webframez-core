import { QueryBuilder } from "./QueryBuilder";
declare class DBConnectionFacade {
    connections: {
        [key: string]: any;
    };
    getConnectionConfig(connection: string): any;
    getConnectionDriver(connection: string): any;
    getConnection(connectionName?: string): Promise<any>;
    runQuery(query: QueryBuilder, options?: {
        [name: string]: any;
    }): Promise<any>;
    execute(data: any, connectionName?: string): Promise<any>;
    getDriver(connectionName?: string): Promise<any>;
    mapDataToModel(model: any, data: any): any;
}
export declare const DBConnection: DBConnectionFacade;
export {};
