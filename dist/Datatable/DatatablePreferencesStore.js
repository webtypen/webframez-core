"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatatablePreferencesStore = void 0;
const crypto_1 = require("crypto");
const DBConnection_1 = require("../Database/DBConnection");
/** Document-store adapter for per-owner table layouts. The deterministic ID makes first saves atomic. */
class DatatablePreferencesStore {
    constructor(config = {}) {
        this.config = config;
    }
    scope(req) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            const user = (_b = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : req.user;
            const userId = user === null || user === void 0 ? void 0 : user[(_c = user.__primaryKey) !== null && _c !== void 0 ? _c : "_id"];
            const owner = this.config.owner ? yield this.config.owner(req) : userId !== undefined && userId !== null ? { _user: userId } : null;
            if (!owner || !Object.keys(owner).length || typeof ((_d = req.body) === null || _d === void 0 ? void 0 : _d._table) !== "string" || !req.body._table.trim())
                return null;
            if (Object.entries(owner).some(([key, value]) => ["_id", "table", "columns", "updated_at"].includes(key) || value === null || value === undefined)) {
                throw new Error("Invalid datatable preference owner.");
            }
            const identity = Object.keys(owner).sort().map(key => [key, typeof owner[key] === "number" ? "number" : "id", String(owner[key])]);
            const id = (0, crypto_1.createHash)("sha256").update(JSON.stringify([req.body._table, identity])).digest("hex");
            return Object.assign(Object.assign({}, owner), { table: req.body._table, _id: id });
        });
    }
    collection() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            return (yield DBConnection_1.DBConnection.getDocumentStore(this.config.connection)).collection((_a = this.config.collection) !== null && _a !== void 0 ? _a : "users_datatables");
        });
    }
    load(scope) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            return (_b = (_a = (yield (yield this.collection()).findOne(scope))) === null || _a === void 0 ? void 0 : _a.columns) !== null && _b !== void 0 ? _b : null;
        });
    }
    save(scope, columns) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (yield this.collection()).updateOne(scope, { $set: { columns, updated_at: new Date() } }, { upsert: true });
        });
    }
    reset(scope) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (yield this.collection()).deleteOne(scope);
        });
    }
}
exports.DatatablePreferencesStore = DatatablePreferencesStore;
