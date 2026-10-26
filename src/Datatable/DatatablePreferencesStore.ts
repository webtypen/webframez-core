import { createHash } from "crypto";
import type { DatabaseId } from "../Database/DatabaseAdapter";
import { DBConnection } from "../Database/DBConnection";
import type { Request } from "../Router/Request";
import type { DatatableColumnPreference, DatatableColumnPreferencesConfig } from "./DatatableColumnPreferences";

/** Document-store adapter for per-owner table layouts. The deterministic ID makes first saves atomic. */
export class DatatablePreferencesStore {
    constructor(private config: DatatableColumnPreferencesConfig = {}) {}

    async scope(req: Request) {
        const user = req.auth?.user ?? req.user;
        const userId = user?.[user.__primaryKey ?? "_id"];
        const owner: Record<string, DatabaseId> | null = this.config.owner ? await this.config.owner(req) : userId !== undefined && userId !== null ? { _user: userId } : null;
        if (!owner || !Object.keys(owner).length || typeof req.body?._table !== "string" || !req.body._table.trim()) return null;
        if (Object.entries(owner).some(([key, value]) => ["_id", "table", "columns", "updated_at"].includes(key) || value === null || value === undefined)) {
            throw new Error("Invalid datatable preference owner.");
        }

        const identity = Object.keys(owner).sort().map(key => [key, typeof owner[key] === "number" ? "number" : "id", String(owner[key])]);
        const id = createHash("sha256").update(JSON.stringify([req.body._table, identity])).digest("hex");
        return { ...owner, table: req.body._table, _id: id };
    }

    private async collection() {
        return (await DBConnection.getDocumentStore(this.config.connection)).collection(this.config.collection ?? "users_datatables");
    }

    async load(scope: Record<string, any>) {
        return (await (await this.collection()).findOne(scope))?.columns ?? null;
    }

    async save(scope: Record<string, any>, columns: DatatableColumnPreference[]) {
        await (await this.collection()).updateOne(scope, { $set: { columns, updated_at: new Date() } }, { upsert: true });
    }

    async reset(scope: Record<string, any>) {
        await (await this.collection()).deleteOne(scope);
    }
}
