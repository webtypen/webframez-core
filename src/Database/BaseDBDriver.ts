import { Model } from "./Model";
import { QueryBuilder } from "./QueryBuilder";

export class BaseDBDriver {
  config?: object;

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
