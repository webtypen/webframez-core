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
exports.PasswordReset = void 0;
const bcryptjs_1 = require("bcryptjs");
const DBConnection_1 = require("../Database/DBConnection");
const AuthSecurity_1 = require("./AuthSecurity");
/** Framework adapter: the password change and token consumption are one conditional database update. */
class PasswordReset {
    constructor(model, key, fields, options, allowed, invalidate, database) {
        var _a;
        this.model = model;
        this.key = key;
        this.fields = fields;
        this.options = options;
        this.allowed = allowed;
        this.invalidate = invalidate;
        this.database = database;
        this.tokenSeconds = (0, AuthSecurity_1.authLifetime)(options.tokenSeconds, 15 * 60);
        this.cooldownSeconds = (0, AuthSecurity_1.authLifetime)(options.cooldownSeconds, 3 * 60);
        this.revokeSessions = (_a = options.revokeSessions) !== null && _a !== void 0 ? _a : "all";
        if (!["all", "scope", false].includes(this.revokeSessions))
            throw new Error("Invalid password reset session policy.");
        const prefix = `auth_reset_${key}_`;
        this.hashField = prefix + "hash";
        this.expiresField = prefix + "expires_at";
        this.requestedField = prefix + "requested_at";
        this.hiddenFields = [this.hashField, this.expiresField, this.requestedField];
    }
    rows() {
        return __awaiter(this, void 0, void 0, function* () {
            const instance = new this.model();
            const db = yield (this.database ? this.database() : DBConnection_1.DBConnection.getDocumentStore(instance.__connection));
            return db.collection(instance.__table);
        });
    }
    digest(token, user) {
        // Bind reset tokens to the scope and current password: a later password change invalidates them.
        return (0, AuthSecurity_1.hashAuthToken)(`${this.key}\0${token}\0${user[this.fields.password]}`);
    }
    userForToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof token !== "string" || !/^[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{43}$/.test(token))
                return null;
            const subject = token.split(".")[0];
            const id = this.fields.primaryKey === "_id" ? yield this.model.objectId(subject, { noExceptions: true }) : subject;
            if (id == null)
                return null;
            const user = yield this.model.where(this.fields.primaryKey, "=", id).first();
            if (!user || typeof user[this.fields.password] !== "string" || !(yield this.allowed(user)))
                return null;
            return user;
        });
    }
    /** No account-existence result is returned. Deliver the raw token only through a trusted server callback. */
    request(identifier, deliver) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof identifier !== "string" || !identifier.trim() || identifier.length > 320)
                return;
            const user = yield this.model.where(this.fields.identifier, "=", identifier.trim().toLowerCase()).first();
            if (!user || typeof user[this.fields.password] !== "string" || !(yield this.allowed(user)))
                return;
            const now = Date.now(), expiresAt = now + this.tokenSeconds * 1000;
            const token = `${user[this.fields.primaryKey]}.${(0, AuthSecurity_1.randomAuthToken)()}`;
            const filter = { [this.fields.primaryKey]: user[this.fields.primaryKey],
                [this.fields.password]: user[this.fields.password],
                $or: [{ [this.requestedField]: { $exists: false } }, { [this.requestedField]: { $lte: now - this.cooldownSeconds * 1000 } }] };
            const updated = yield (yield this.rows()).findOneAndUpdate(filter, { $set: { [this.hashField]: this.digest(token, user), [this.expiresField]: expiresAt, [this.requestedField]: now } }, { returnDocument: "after" });
            if (updated)
                yield deliver(user, token, expiresAt);
        });
    }
    /** A non-consuming check for the reset form; reset() always checks again atomically. */
    validate(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.userForToken(token);
            if (!user)
                return null;
            const row = yield (yield this.rows()).findOne({ [this.fields.primaryKey]: user[this.fields.primaryKey],
                [this.fields.password]: user[this.fields.password], [this.hashField]: this.digest(token, user), [this.expiresField]: { $gt: Date.now() } });
            return row ? user : null;
        });
    }
    reset(token, password) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof password !== "string" || !password || password.length > 1024)
                throw new Error("Invalid password.");
            const user = yield this.validate(token);
            if (!user)
                return null;
            const stored = user[this.fields.password];
            const nextPassword = yield (0, bcryptjs_1.hash)(password, 12);
            const row = yield (yield this.rows()).findOneAndUpdate(Object.assign({ [this.fields.primaryKey]: user[this.fields.primaryKey], [this.fields.password]: stored, [this.hashField]: this.digest(token, user), [this.expiresField]: { $gt: Date.now() } }, (this.fields.active === false ? {} : { [this.fields.active]: { $ne: false } })), { $set: { [this.fields.password]: nextPassword }, $unset: { [this.hashField]: "", [this.expiresField]: "" } }, { returnDocument: "after" });
            if (!row)
                return null;
            user[this.fields.password] = nextPassword;
            if (this.revokeSessions !== false)
                yield this.invalidate(user, this.revokeSessions);
            return user;
        });
    }
}
exports.PasswordReset = PasswordReset;
