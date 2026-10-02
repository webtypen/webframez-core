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
const crypto_1 = require("crypto");
const DBConnection_1 = require("../Database/DBConnection");
const AuthSecurity_1 = require("./AuthSecurity");
function publicSession(record) {
    return Object.assign(Object.assign({ id: String(record._id), subject: String(record._subject), issuer: record.issuer, audience: record.audience, scope: record.scope, environment: record.environment, createdAt: record.createdAt, expiresAt: record.expiresAt, parent: record.parent }, (record.userAgent !== undefined ? { userAgent: record.userAgent } : {})), (record.lastActiveAt !== undefined ? { lastActiveAt: record.lastActiveAt } : {}));
}
function tokenSessionId(token) {
    return typeof token === "string" && /^[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{43}$/.test(token) ? token.split(".")[0] : null;
}
/** Revocable, hashed, independently addressable device sessions. Legacy UserAuth is unaffected. */
class SessionAuth {
    constructor(options) {
        var _a, _b;
        this.options = options;
        this.scope = Object.assign({ issuer: (0, AuthSecurity_1.authText)(options.issuer, "issuer"), audience: (0, AuthSecurity_1.authText)(options.audience, "audience"), scope: (0, AuthSecurity_1.authText)((_a = options.scope) !== null && _a !== void 0 ? _a : "main", "scope") }, (options.allowDynamicEnvironment && options.environment === undefined ? {}
            : { environment: options.environment === undefined ? null : (0, AuthSecurity_1.authText)(options.environment, "environment") }));
        this.accessSeconds = (0, AuthSecurity_1.authLifetime)(options.accessTokenSeconds, 15 * 60);
        this.sessionSeconds = (0, AuthSecurity_1.authLifetime)(options.sessionSeconds, 30 * 86400);
        this.idleSeconds = options.idleTimeoutSeconds === undefined || options.idleTimeoutSeconds === false ? false : (0, AuthSecurity_1.authLifetime)(options.idleTimeoutSeconds, 7 * 86400);
        if (((_b = options.parentSessions) === null || _b === void 0 ? void 0 : _b.mode) === "reuse" && (typeof options.parentSessions.secret !== "string" || options.parentSessions.secret.length < 32)) {
            throw new Error("Parent session reuse requires a strong server secret.");
        }
        if (typeof options.isSessionAllowed !== "function")
            throw new Error("SessionAuth requires isSessionAllowed.");
    }
    ids() {
        return this.options.idAdapter || DBConnection_1.DBConnection.getIdAdapter(this.options.connection);
    }
    sessionId(value) {
        const adapter = this.ids();
        const native = adapter.normalize(value);
        // Converted legacy MongoDB sessions keep working with their existing opaque token prefix.
        return native !== null && native !== void 0 ? native : (/^[A-Za-z0-9_-]{43}$/.test(value) ? adapter.normalize((0, AuthSecurity_1.hashAuthToken)(value).slice(0, 24)) : null);
    }
    rows() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield (this.options.database ? this.options.database() : DBConnection_1.DBConnection.getDocumentStore(this.options.connection));
            return db.collection(this.options.collection || "auth_sessions");
        });
    }
    liveFilter(now = Date.now()) {
        return Object.assign({ revokedAt: null, expiresAt: { $gt: now }, createdAt: { $gt: now - this.sessionSeconds * 1000 } }, (this.idleSeconds === false ? {} : { $and: [{ $or: [
                        { lastActiveAt: { $gt: now - this.idleSeconds * 1000 } },
                        { lastActiveAt: { $exists: false }, createdAt: { $gt: now - this.idleSeconds * 1000 } },
                    ] }] }));
    }
    allowed(record) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!record || record.revokedAt !== null || !Number.isFinite(record.expiresAt) || Math.min(record.expiresAt, record.createdAt + this.sessionSeconds * 1000) <= Date.now()
                || (this.idleSeconds !== false && ((_a = record.lastActiveAt) !== null && _a !== void 0 ? _a : record.createdAt) + this.idleSeconds * 1000 <= Date.now()))
                return null;
            const session = publicSession(record);
            return (yield this.options.isSessionAllowed(session)) ? session : null;
        });
    }
    pair(record, access, refresh) {
        return { auth_token: access, refresh_token: refresh, auth_expires_at: record.accessExpiresAt,
            refresh_expires_at: Math.min(record.expiresAt, record.createdAt + this.sessionSeconds * 1000), session: publicSession(record) };
    }
    credentials(record) {
        var _a, _b, _c;
        if (!record.credentialState || !((_a = this.options.parentSessions) === null || _a === void 0 ? void 0 : _a.secret))
            throw new Error("Linked session credentials are unavailable.");
        const context = JSON.stringify([String(record._id), String(record._subject), record.issuer, record.audience,
            record.scope, record.environment, (_b = record.parent) === null || _b === void 0 ? void 0 : _b.issuer, (_c = record.parent) === null || _c === void 0 ? void 0 : _c.sessionId]);
        const derive = (kind) => (0, crypto_1.createHmac)("sha256", this.options.parentSessions.secret)
            .update(JSON.stringify(["webframez-parent-session-v1", context, kind, record.credentialState[kind]])).digest("base64url");
        return { access: `${record._id}.${derive("access")}`, refresh: `${record._id}.${derive("refresh")}`, csrf: derive("csrf") };
    }
    reuse(record) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(yield this.allowed(record)))
                throw new Error("Session is not allowed.");
            const credentials = this.credentials(record);
            if ((0, AuthSecurity_1.hashAuthToken)(credentials.access) !== record.accessHash || (0, AuthSecurity_1.hashAuthToken)(credentials.refresh) !== record.refreshHash
                || (0, AuthSecurity_1.hashAuthToken)(credentials.csrf) !== record.csrfHash)
                throw new Error("Linked session credentials have changed.");
            if (record.accessExpiresAt <= Date.now()) {
                yield this.renewAccess(credentials.refresh);
                const current = yield (yield this.rows()).findOne(Object.assign({ _id: record._id }, this.scope));
                if (!current || current.accessExpiresAt <= Date.now())
                    throw new Error("Linked session access could not be renewed.");
                return this.reuse(current);
            }
            const session = publicSession(record);
            yield this.touch(session);
            return Object.assign(Object.assign({}, this.pair(record, credentials.access, credentials.refresh)), { session, csrf_token: credentials.csrf, reused: true });
        });
    }
    linkedRecord(record) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield (this.options.database ? this.options.database() : DBConnection_1.DBConnection.getDocumentStore(this.options.connection));
            const links = db.collection(`${this.options.collection || "auth_sessions"}_links`);
            const key = (0, AuthSecurity_1.hashAuthToken)(JSON.stringify([record.issuer, record.audience, record.scope, String(record._subject),
                record.environment, record.parent.issuer, record.parent.sessionId]));
            let link;
            try {
                link = yield links.findOneAndUpdate({ _id: key }, { $setOnInsert: Object.assign(Object.assign({}, this.scope), { environment: record.environment, sessionId: record._id, purgeAt: new Date(record.expiresAt) }) }, { upsert: true, returnDocument: "after" });
            }
            catch (error) {
                if (error.code !== 11000)
                    throw error;
                link = yield links.findOne({ _id: key });
            }
            if (!link)
                throw new Error("Linked session reference is unavailable.");
            for (let attempt = 0; attempt < 5; attempt++) {
                const candidate = Object.assign(Object.assign({}, record), { _id: link.sessionId, accessExpiresAt: Math.min(record.accessExpiresAt, record.expiresAt) });
                const credentials = this.credentials(candidate);
                Object.assign(candidate, { accessHash: (0, AuthSecurity_1.hashAuthToken)(credentials.access), refreshHash: (0, AuthSecurity_1.hashAuthToken)(credentials.refresh), csrfHash: (0, AuthSecurity_1.hashAuthToken)(credentials.csrf) });
                let stored;
                try {
                    stored = yield (yield this.rows()).findOneAndUpdate({ _id: candidate._id }, { $setOnInsert: candidate }, { upsert: true, returnDocument: "after" });
                }
                catch (error) {
                    if (error.code !== 11000)
                        throw error;
                    stored = yield (yield this.rows()).findOne({ _id: candidate._id });
                }
                if (!stored)
                    throw new Error("Linked session is unavailable.");
                // A denied parent or membership must fail closed, rather than create another session.
                if (stored.revokedAt === null && stored.expiresAt > Date.now()
                    && stored.createdAt + this.sessionSeconds * 1000 > Date.now()
                    && (this.idleSeconds === false || ((_a = stored.lastActiveAt) !== null && _a !== void 0 ? _a : stored.createdAt) + this.idleSeconds * 1000 > Date.now()))
                    return stored;
                link = (yield links.findOneAndUpdate({ _id: key, sessionId: stored._id }, { $set: { sessionId: this.ids().create(), purgeAt: new Date(record.expiresAt) } }, { returnDocument: "after" }))
                    || (yield links.findOne({ _id: key }));
            }
            throw new Error("Linked session could not be established.");
        });
    }
    create(subject, parent = null, environment, parentExpiresAt) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(subject, "subject");
            if (environment !== undefined && (!this.options.allowDynamicEnvironment || this.options.environment !== undefined)) {
                throw new Error("Dynamic session environments are not enabled.");
            }
            if (parent) {
                (0, AuthSecurity_1.authText)(parent.issuer, "parent issuer");
                (0, AuthSecurity_1.authText)(parent.sessionId, "parent session");
            }
            if (parentExpiresAt !== undefined && (!parent || !Number.isFinite(parentExpiresAt) || parentExpiresAt <= Date.now())) {
                throw new Error("Invalid parent session expiry.");
            }
            const now = Date.now(), id = this.ids().create();
            const access = `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`, refresh = `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`, csrf = (0, AuthSecurity_1.randomAuthToken)();
            const record = Object.assign(Object.assign({ _id: id, _subject: this.ids().create(subject) }, this.scope), { environment: environment === undefined ? (_a = this.scope.environment) !== null && _a !== void 0 ? _a : null : (0, AuthSecurity_1.authText)(environment, "environment"), parent: parent ? Object.assign({}, parent) : null, createdAt: now, lastActiveAt: now, expiresAt: Math.min(now + this.sessionSeconds * 1000, parentExpiresAt !== null && parentExpiresAt !== void 0 ? parentExpiresAt : Infinity), accessExpiresAt: now + Math.min(this.accessSeconds, this.sessionSeconds) * 1000, accessHash: (0, AuthSecurity_1.hashAuthToken)(access), refreshHash: (0, AuthSecurity_1.hashAuthToken)(refresh), csrfHash: (0, AuthSecurity_1.hashAuthToken)(csrf), usedRefreshHashes: [], revokedAt: null });
            if (!(yield this.allowed(record)))
                throw new Error("Session is not allowed.");
            if (parent && ((_b = this.options.parentSessions) === null || _b === void 0 ? void 0 : _b.mode) === "reuse") {
                record.credentialState = { access: (0, AuthSecurity_1.randomAuthToken)(), refresh: (0, AuthSecurity_1.randomAuthToken)(), csrf: (0, AuthSecurity_1.randomAuthToken)() };
                const stored = yield this.linkedRecord(record);
                const pair = yield this.reuse(stored);
                return Object.assign(Object.assign({}, pair), { reused: ((_c = stored.credentialState) === null || _c === void 0 ? void 0 : _c.access) !== record.credentialState.access });
            }
            record.accessExpiresAt = Math.min(record.accessExpiresAt, record.expiresAt);
            yield (yield this.rows()).insertOne(record);
            return Object.assign(Object.assign({}, this.pair(record, access, refresh)), { csrf_token: csrf });
        });
    }
    authenticate(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id)
                return null;
            const row = yield (yield this.rows()).findOne(Object.assign(Object.assign(Object.assign({ _id: this.sessionId(id) }, this.scope), this.liveFilter()), { accessHash: (0, AuthSecurity_1.hashAuthToken)(token), accessExpiresAt: { $gt: Date.now() } }));
            const session = yield this.allowed(row);
            if (session && this.idleSeconds !== false)
                yield this.touch(session);
            return session;
        });
    }
    /** Trusted-server introspection; never expose this method as an unauthenticated endpoint. */
    inspect(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId))
                return null;
            return this.allowed(yield (yield this.rows()).findOne(Object.assign({ _id: this.sessionId(sessionId) }, this.scope)));
        });
    }
    verifyCsrf(token, csrf, kind = "access") {
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id || typeof csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(csrf))
                return false;
            const row = yield (yield this.rows()).findOne(Object.assign(Object.assign(Object.assign(Object.assign({ _id: this.sessionId(id) }, this.scope), (kind === "access" ? { accessHash: (0, AuthSecurity_1.hashAuthToken)(token) } : { $or: [{ refreshHash: (0, AuthSecurity_1.hashAuthToken)(token) }, { usedRefreshHashes: (0, AuthSecurity_1.hashAuthToken)(token) }] })), { csrfHash: (0, AuthSecurity_1.hashAuthToken)(csrf) }), (kind === "access" ? { accessExpiresAt: { $gt: Date.now() } } : {})));
            return !!(yield this.allowed(row));
        });
    }
    /** One winner under concurrency. A previously consumed refresh token revokes its device session. */
    refresh(token) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id)
                return null;
            const rows = yield this.rows(), hash = (0, AuthSecurity_1.hashAuthToken)(token);
            const row = yield rows.findOne(Object.assign({ _id: this.sessionId(id) }, this.scope));
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
            const credentialState = row.credentialState ? Object.assign(Object.assign({}, row.credentialState), { access: (0, AuthSecurity_1.randomAuthToken)(), refresh: (0, AuthSecurity_1.randomAuthToken)() }) : undefined;
            const credentials = credentialState ? this.credentials(Object.assign(Object.assign({}, row), { credentialState })) : null;
            const access = (_a = credentials === null || credentials === void 0 ? void 0 : credentials.access) !== null && _a !== void 0 ? _a : `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`, refresh = (_b = credentials === null || credentials === void 0 ? void 0 : credentials.refresh) !== null && _b !== void 0 ? _b : `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`;
            const next = yield rows.findOneAndUpdate(Object.assign(Object.assign(Object.assign({ _id: this.sessionId(id) }, this.scope), { refreshHash: hash }), this.liveFilter()), { $set: Object.assign(Object.assign({}, (credentialState ? { credentialState } : {})), { accessHash: (0, AuthSecurity_1.hashAuthToken)(access), refreshHash: (0, AuthSecurity_1.hashAuthToken)(refresh), accessExpiresAt: Math.min(Date.now() + this.accessSeconds * 1000, row.expiresAt, row.createdAt + this.sessionSeconds * 1000), lastActiveAt: Date.now(), usedRefreshHashes: [...row.usedRefreshHashes, hash] }) }, { returnDocument: "after" });
            if (!next) {
                // Also detect simultaneous replay that lost the compare-and-swap.
                yield rows.updateOne(Object.assign(Object.assign({ _id: this.sessionId(id) }, this.scope), { usedRefreshHashes: hash, revokedAt: null }), { $set: { revokedAt: Date.now() } });
                return null;
            }
            return this.pair(next, access, refresh);
        });
    }
    /** Trusted server refresh-secret lookup; never expose as a public endpoint. */
    inspectRefresh(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id)
                return null;
            return this.allowed(yield (yield this.rows()).findOne(Object.assign(Object.assign(Object.assign({ _id: this.sessionId(id) }, this.scope), { refreshHash: (0, AuthSecurity_1.hashAuthToken)(token) }), this.liveFilter())));
        });
    }
    /** Trusted browser GET resumption: renew access without consuming or replaying refresh rotation. */
    renewAccess(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = tokenSessionId(token);
            if (!id)
                return null;
            const rows = yield this.rows();
            const filter = Object.assign(Object.assign(Object.assign(Object.assign({ _id: this.sessionId(id) }, this.scope), { refreshHash: (0, AuthSecurity_1.hashAuthToken)(token) }), this.liveFilter()), { accessExpiresAt: { $lte: Date.now() } });
            const row = yield rows.findOne(filter);
            if (!row || !(yield this.allowed(row)))
                return null;
            const credentialState = row.credentialState ? Object.assign(Object.assign({}, row.credentialState), { access: (0, AuthSecurity_1.randomAuthToken)() }) : undefined;
            const access = credentialState ? this.credentials(Object.assign(Object.assign({}, row), { credentialState })).access : `${id}.${(0, AuthSecurity_1.randomAuthToken)()}`, now = Date.now();
            const next = yield rows.findOneAndUpdate(filter, { $set: Object.assign(Object.assign({}, (credentialState ? { credentialState } : {})), { accessHash: (0, AuthSecurity_1.hashAuthToken)(access), accessExpiresAt: Math.min(now + this.accessSeconds * 1000, row.expiresAt, row.createdAt + this.sessionSeconds * 1000), lastActiveAt: now }) }, { returnDocument: "after" });
            const session = next ? yield this.allowed(next) : null;
            return next && session ? Object.assign(Object.assign({}, this.pair(next, access, token)), { session }) : null;
        });
    }
    /** Browser login metadata; arbitrary request data and token hashes are never exposed. */
    recordLogin(session, userAgent) {
        return __awaiter(this, void 0, void 0, function* () {
            const metadata = { userAgent: userAgent.slice(0, 512), lastActiveAt: session.createdAt };
            yield (yield this.rows()).updateOne(Object.assign(Object.assign({ _id: this.sessionId(session.id) }, this.scope), { revokedAt: null }), { $set: metadata });
            Object.assign(session, metadata);
        });
    }
    /** Persist activity with a one-minute throttle; authorization does not depend on this timestamp. */
    touch(session) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            if (((_a = session.lastActiveAt) !== null && _a !== void 0 ? _a : session.createdAt) >= now - (this.idleSeconds === false ? 60000 : Math.min(60000, this.idleSeconds * 250)))
                return;
            yield (yield this.rows()).updateOne(Object.assign(Object.assign({ _id: this.sessionId(session.id) }, this.scope), this.liveFilter(now)), { $max: { lastActiveAt: now } });
            session.lastActiveAt = now;
        });
    }
    revoke(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(sessionId, "session ID");
            yield (yield this.rows()).updateOne(Object.assign(Object.assign({ _id: this.sessionId(sessionId) }, this.scope), { revokedAt: null }), { $set: { revokedAt: Date.now() } });
        });
    }
    revokeAll(subject) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(subject, "subject");
            yield (yield this.rows()).updateMany(Object.assign(Object.assign({ _subject: this.ids().create(subject) }, this.scope), { revokedAt: null }), { $set: { revokedAt: Date.now() } });
        });
    }
    list(subject) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, AuthSecurity_1.authText)(subject, "subject");
            const rows = yield (yield this.rows()).find(Object.assign(Object.assign({ _subject: this.ids().create(subject) }, this.scope), this.liveFilter())).toArray();
            return rows.map(publicSession);
        });
    }
    /** Run periodically; authorization checks never depend on cleanup scheduling. */
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            yield (yield this.rows()).deleteMany(Object.assign(Object.assign({}, this.scope), { $or: [
                    { expiresAt: { $lte: now } }, { createdAt: { $lte: now - this.sessionSeconds * 1000 } },
                    ...(this.idleSeconds === false ? [] : [
                        { lastActiveAt: { $lte: now - this.idleSeconds * 1000 } },
                        { lastActiveAt: { $exists: false }, createdAt: { $lte: now - this.idleSeconds * 1000 } },
                    ]),
                ] }));
        });
    }
}
exports.SessionAuth = SessionAuth;
