import { Model } from "./Model";
import { QueryBuilder } from "./QueryBuilder";
export declare class BaseDBDriver {
    config?: object;
    setConfig(config: object): void;
    connect(): Promise<void>;
    close(client: any): Promise<void>;
    handleQueryBuilder(client: any, queryBuilder: QueryBuilder): Promise<void>;
    execute(client: any, data: any): Promise<void>;
    onModelSave(model: Model, saveStatus: any | null | undefined): Promise<Model>;
}
