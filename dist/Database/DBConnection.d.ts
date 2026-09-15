import type { DatabaseIdAdapter, DocumentDatabase } from "./DatabaseAdapter";
import { QueryBuilder } from "./QueryBuilder";
type ObjectIDType = {
    noExceptions?: Boolean;
};
declare class DBConnectionFacade {
    connections: {
        [key: string]: any;
    };
    getConnectionConfig(connection?: string): any;
    getConnectionDriver(connection?: string): any;
    /** Resolves ID handling without opening a connection. Core import stays side-effect free. */
    getIdAdapter(connectionName?: string): DatabaseIdAdapter;
    documentStore(connection: any): DocumentDatabase;
    getDocumentStore(connectionName?: string): Promise<DocumentDatabase>;
    getConnection(connectionName?: string): Promise<any>;
    runQuery(query: QueryBuilder, options?: {
        [name: string]: any;
    }): Promise<any>;
    execute(data: any, connectionName?: string, options?: any): Promise<any>;
    getDriver(connectionName?: string): Promise<any>;
    objectId(val?: any, connectionName?: string, options?: ObjectIDType): Promise<any>;
    mapDataToModel(model: any, data: any): any;
}
export declare const DBConnection: DBConnectionFacade;
export {};
