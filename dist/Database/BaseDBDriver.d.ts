import type { DatabaseIdAdapter, DocumentDatabase } from "./DatabaseAdapter";
import { Model } from "./Model";
import { QueryBuilder } from "./QueryBuilder";
export declare class BaseDBDriver {
    config?: object;
    get idAdapter(): DatabaseIdAdapter;
    documentStore(client: any): DocumentDatabase;
    objectId(value?: unknown): Promise<import("./DatabaseAdapter").DatabaseId>;
    setConfig(config: object): void;
    connect(): Promise<void>;
    close(client: any): Promise<void>;
    handleQueryBuilder(client: any, queryBuilder: QueryBuilder): Promise<void>;
    execute(client: any, data: any): Promise<void>;
    backup(client: any, options: any): Promise<void>;
    onModelSave(model: Model, saveStatus: any | null | undefined): Promise<Model>;
}
