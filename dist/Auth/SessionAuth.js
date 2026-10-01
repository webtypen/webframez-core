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
exports.SessionAuth = void 0;
const DBConnection_1 = require("../Database/DBConnection");
const AuthSecurity_1 = require("./AuthSecurity");
function publicSession(record) {
    return Object.assign(Object.assign({ id: record.id, subject: record.subject, issuer: record.issuer, audience: record.audience, environment: record.environment, createdAt: record.createdAt, expiresAt: record.expiresAt, parent: record.parent }, (record.userAgent !== undefined ? { userAgent: record.userAgent } : {})), (record.lastActiveAt !== undefined ? { lastActiveAt: record.lastActiveAt } : {}));
}
function tokenSessionId(token) {
    return typeof token === "string" && /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token) ? token.split(".")[0] : null;
}
/** Revocable, hashed, independently addressable device sessions. Legacy UserAuth is unaffected. */
class SessionAuth {
    constructor(options) {
        this.options = options;
        this.scope = { issuer: (0, AuthSecurity_1.authText)(options.issuer, "issuer"), audience: (0, AuthSecurity_1.authText)(options.audience, "audience"),
            environment: options.environment === undefined ? null : (0, AuthSecurity_1.authText)(options.environment, "environment") };
        this.accessSeconds = (0, AuthSecurity_1.authLifetime)(options.accessTokenSeconds, 15 * 60);
        this.sessionSeconds = (0, AuthSecurity_1.authLifetime)(options.sessionSeconds, 30 * 86400);
        if (typeof options.isSessionAllowed !== "function")
            throw new Error("SessionAuth requires isSessionAllowed.");
    }
    rows() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield (this.options.database ? this.options.database() : DBConnection_1.DBConnection.getDocumentStore(this.options.connection));
            return db.collection(this.options.collection || "auth_sessions");
        });
    }
    allowed(record) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!record || record.revokedAt !== null || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now())
                return null;
            const session = publicSession(record);
            return (yield this.options.isSessionAllowed(session)) ? session : null;
        });
    }
    pair(record, access, refresh) {
        return { auth_token: access, refresh_token: refresh, auth_expires_at: record.accessExpiresAt,
            refresh_expires_at: record.expiresAt, session: publicSession(record) };
    }
    create(subject, parent = null) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(subject, "subject");
            if (parent) {
                (0, AuthSecurity_1.authText)(parent.issuer, "parent issuer");
                (0, AuthSecurity_1.authText)(parent.sessionId, "parent session");
            }
            const now = Date.now(), id = (0, AuthSecurity_1.randomAuthToken)();
            const access = `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`, refresh = `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`, csrf = (0, AuthSecurity_1.randomAuthToken)();
            const record = Object.assign(Object.assign({ _id: id, id, subject }, this.scope), { parent: parent ? Object.assign({}, parent) : null, createdAt: now, expiresAt: now + this.sessionSeconds * 1000, accessExpiresAt: now + Math.min(this.accessSeconds, this.sessionSeconds) * 1000, accessHash: (0, AuthSecurity_1.hashAuthToken)(access), refreshHash: (0, AuthSecurity_1.hashAuthToken)(refresh), csrfHash: (0, AuthSecurity_1.hashAuthToken)(csrf), usedRefreshHashes: [], revokedAt: null });
            if (!(yield this.allowed(record)))
                throw new Error("Session is not allowed.");
            yield (yield this.rows()).insertOne(record);
            return Object.assign(Object.assign({}, this.pair(record, access, refresh)), { csrf_token: csrf });
        });
    }
    authenticate(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id)
                return null;
            const row = yield (yield this.rows()).findOne(Object.assign(Object.assign({ _id: id }, this.scope), { accessHash: (0, AuthSecurity_1.hashAuthToken)(token), accessExpiresAt: { $gt: Date.now() } }));
            return this.allowed(row);
        });
    }
    /** Trusted-server introspection; never expose this method as an unauthenticated endpoint. */
    inspect(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(sessionId))
                return null;
            return this.allowed(yield (yield this.rows()).findOne(Object.assign({ _id: sessionId }, this.scope)));
        });
    }
    verifyCsrf(token, csrf, kind = "access") {
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id || typeof csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(csrf))
                return false;
            const row = yield (yield this.rows()).findOne(Object.assign(Object.assign(Object.assign(Object.assign({ _id: id }, this.scope), (kind === "access" ? { accessHash: (0, AuthSecurity_1.hashAuthToken)(token) } : { $or: [{ refreshHash: (0, AuthSecurity_1.hashAuthToken)(token) }, { usedRefreshHashes: (0, AuthSecurity_1.hashAuthToken)(token) }] })), { csrfHash: (0, AuthSecurity_1.hashAuthToken)(csrf) }), (kind === "access" ? { accessExpiresAt: { $gt: Date.now() } } : {})));
            return !!(yield this.allowed(row));
        });
    }
    /** One winner under concurrency. A previously consumed refresh token revokes its device session. */
    refresh(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id)
                return null;
            const rows = yield this.rows(), hash = (0, AuthSecurity_1.hashAuthToken)(token);
            const row = yield rows.findOne(Object.assign({ _id: id }, this.scope));
            if (!(yield this.allowed(row)) || !row)
                return null;
            if (row.refreshHash !== hash) {
                if (row.usedRefreshHashes.includes(hash))
                    yield this.revoke(id);
                return null;
            }
            // Bound history size and retain an absolute expiry instead of extending sessions indefinitely.
            if (row.usedRefreshHashes.length >= 4096) {
                yield this.revoke(id);
                return null;
            }
            const access = `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`, refresh = `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`;
            const next = yield rows.findOneAndUpdate(Object.assign(Object.assign({ _id: id }, this.scope), { refreshHash: hash, revokedAt: null, expiresAt: { $gt: Date.now() } }), { $set: { accessHash: (0, AuthSecurity_1.hashAuthToken)(access), refreshHash: (0, AuthSecurity_1.hashAuthToken)(refresh),
                    accessExpiresAt: Math.min(Date.now() + this.accessSeconds * 1000, row.expiresAt),
                    usedRefreshHashes: [...row.usedRefreshHashes, hash] } }, { returnDocument: "after" });
            if (!next) {
                // Also detect simultaneous replay that lost the compare-and-swap.
                yield rows.updateOne(Object.assign(Object.assign({ _id: id }, this.scope), { usedRefreshHashes: hash, revokedAt: null }), { $set: { revokedAt: Date.now() } });
                return null;
            }
            return this.pair(next, access, refresh);
        });
    }
    /** Browser login metadata; arbitrary request data and token hashes are never exposed. */
    recordLogin(session, userAgent) {
        return __awaiter(this, void 0, void 0, function* () {
            const metadata = { userAgent: userAgent.slice(0, 512), lastActiveAt: session.createdAt };
            yield (yield this.rows()).updateOne(Object.assign(Object.assign({ _id: session.id }, this.scope), { revokedAt: null }), { $set: metadata });
            Object.assign(session, metadata);
        });
    }
    /** Persist activity with a one-minute throttle; authorization does not depend on this timestamp. */
    touch(session) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            if (((_a = session.lastActiveAt) !== null && _a !== void 0 ? _a : session.createdAt) >= now - 60000)
                return;
            yield (yield this.rows()).updateOne(Object.assign(Object.assign({ _id: session.id }, this.scope), { revokedAt: null, expiresAt: { $gt: now } }), { $set: { lastActiveAt: now } });
            session.lastActiveAt = now;
        });
    }
    revoke(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(sessionId, "session ID");
            yield (yield this.rows()).updateOne(Object.assign(Object.assign({ _id: sessionId }, this.scope), { revokedAt: null }), { $set: { revokedAt: Date.now() } });
        });
    }
    revokeAll(subject) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(subject, "subject");
            yield (yield this.rows()).updateMany(Object.assign(Object.assign({ subject }, this.scope), { revokedAt: null }), { $set: { revokedAt: Date.now() } });
        });
    }
    list(subject) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(subject, "subject");
            const rows = yield (yield this.rows()).find(Object.assign(Object.assign({ subject }, this.scope), { revokedAt: null, expiresAt: { $gt: Date.now() } })).toArray();
            return rows.map(publicSession);
        });
    }
    /** Run periodically; authorization checks never depend on cleanup scheduling. */
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (yield this.rows()).deleteMany(Object.assign(Object.assign({}, this.scope), { expiresAt: { $lte: Date.now() } }));
        });
    }
}
exports.SessionAuth = SessionAuth;
