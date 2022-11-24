import { DBConnection } from "./DBConnection";
import { Model } from "./Model";

export class QueryBuilder {
  database: string | null = null;
  query: any[] = [];
  queryTable: string = "";
  mode = "get";
  modelMapping = null;

  setModelMapping(model?: any | null) {
    this.modelMapping = model;
    return this;
  }

  table(table: string) {
    this.queryTable = table;
    return this;
  }

  where(column: any, operator: any, value: any) {
    this.query.push({
      type: "where",
      column: column,
      operator: operator,
      value: value,
    });
    return this;
  }

  async get(options?: any) {
    this.mode = "get";

    const result = await DBConnection.runQuery(this);
    if (options && options.disableModelMapping) {
      return result && result.length > 0 ? result : null;
    }

    return result && result.length > 0 && this.modelMapping !== null
      ? result.map((el: Model) =>
          DBConnection.mapDataToModel(this.modelMapping, el)
        )
      : result && result.length > 0
      ? result
      : null;
  }

  async first(options?: any) {
    this.mode = "first";

    const result = await DBConnection.runQuery(this);
    if (options && options.disableModelMapping) {
      return result ? result : null;
    }

    return result && this.modelMapping !== null
      ? DBConnection.mapDataToModel(this.modelMapping, result)
      : null;
  }

  async delete(options?: { mode: string }) {
    this.mode =
      options && options.mode === "deleteOne" ? "deleteOne" : "delete";

    await DBConnection.runQuery(this);
    return true;
  }
}
