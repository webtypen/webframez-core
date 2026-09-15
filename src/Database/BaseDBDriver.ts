import type { DatabaseIdAdapter, DocumentDatabase } from "./DatabaseAdapter";
import { Model } from "./Model";
import { QueryBuilder } from "./QueryBuilder";

export class BaseDBDriver {
  config?: object;

  get idAdapter(): DatabaseIdAdapter {
    throw new Error("This database driver does not implement ID handling.");
  }

  documentStore(client: any): DocumentDatabase {
    throw new Error("This database driver does not support document queries (required for Datatables, DataBuilder, queues and notifications).");
  }

  async objectId(value?: unknown) {
    return this.idAdapter.create(value);
  }


  setConfig(config: object) {
    this.config = config;
  }

  async connect() {}

  async close(client: any) {}

  async handleQueryBuilder(client: any, queryBuilder: QueryBuilder) {}

  async execute(client: any, data: any) {}

  async backup(client: any, options: any) {
    throw new Error("This database driver does not implement backup(...).");
  }

  async onModelSave(model: Model, saveStatus: any | null | undefined) {
    return model;
  }
}
