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
exports.AuthHandoff = void 0;
const crypto_1 = require("crypto");
const DBConnection_1 = require("../Database/DBConnection");
const AuthSecurity_1 = require("./AuthSecurity");
/** Single-use delivery to a separate frontend origin after a server-side SSO callback. */
class AuthHandoff {
    constructor(options) {
        this.options = options;
        if (typeof options.secret !== "string" || options.secret.length < 32)
            throw new Error("Auth handoff requires a strong server secret.");
        if (!options.audience)
            throw new Error("Auth handoff requires an audience.");
        this.key = (0, crypto_1.createHash)("sha256").update(`webframez-handoff:${options.secret}`).digest();
    }
    rows() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield (this.options.database ? this.options.database() : DBConnection_1.DBConnection.getDocumentStore(this.options.connection));
            return db.collection("auth_handoffs");
        });
    }
    create(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const code = (0, AuthSecurity_1.randomAuthToken)(), iv = (0, crypto_1.randomBytes)(12);
            const cipher = (0, crypto_1.createCipheriv)("aes-256-gcm", this.key, iv);
            cipher.setAAD(Buffer.from(this.options.audience));
            const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
            yield (yield this.rows()).insertOne({ _id: (0, AuthSecurity_1.hashAuthToken)(code), audience: this.options.audience,
                iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), payload: encrypted.toString("base64"),
                expiresAt: Date.now() + 30000, purgeAt: new Date(Date.now() + 60000), consumedAt: null });
            return code;
        });
    }
    consume(code) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code))
                return null;
            const row = yield (yield this.rows()).findOneAndUpdate({ _id: (0, AuthSecurity_1.hashAuthToken)(code), audience: this.options.audience,
                expiresAt: { $gt: Date.now() }, consumedAt: null }, { $set: { consumedAt: Date.now(), payload: "" } }, { returnDocument: "before" });
            if (!row)
                return null;
            const decipher = (0, crypto_1.createDecipheriv)("aes-256-gcm", this.key, Buffer.from(row.iv, "base64"));
            decipher.setAAD(Buffer.from(this.options.audience));
            decipher.setAuthTag(Buffer.from(row.tag, "base64"));
            return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.payload, "base64")), decipher.final()]).toString("utf8"));
        });
    }
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (yield this.rows()).deleteMany({ audience: this.options.audience, expiresAt: { $lte: Date.now() } });
        });
    }
}
exports.AuthHandoff = AuthHandoff;
