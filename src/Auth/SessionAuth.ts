import { createHmac } from "crypto";
import { DBConnection } from "../Database/DBConnection";
import type { DatabaseId, DatabaseIdAdapter, DocumentDatabase } from "../Database/DatabaseAdapter";
import { authLifetime, authText, hashAuthToken, randomAuthToken } from "./AuthSecurity";

export type AuthSession = {
    id: string;
    subject: string;
    issuer: string;
    audience: string;
    scope: string;
    environment: string | null;
    userAgent?: string;
    lastActiveAt?: number;
    createdAt: number;
    expiresAt: number;
    parent: { issuer: string; sessionId: string } | null;
};

export type SessionTokenPair = {
    auth_token: string;
    refresh_token: string;
    auth_expires_at: number;
    refresh_expires_at: number;
    session: AuthSession;
};

export type CreatedAuthSession = SessionTokenPair & { csrf_token: string; reused?: boolean };

export type SessionAuthOptions = {
    issuer: string;
    audience: string;
    scope?: string;
    environment?: string;
    /** Allow server-selected environments per session instead of one fixed environment. */
    allowDynamicEnvironment?: boolean;
    /** Reuse one child per parent, subject and environment. Requires a strong server-held secret. */
    parentSessions?: { mode: "new" | "reuse"; secret?: string };
    connection?: string;
    collection?: string;
    accessTokenSeconds?: number;
    sessionSeconds?: number;
    /** Maximum inactivity; false disables the idle limit. */
    idleTimeoutSeconds?: number | false;
    /** Called on creation, authentication and refresh. Check account status and tenant membership here.
     * For federated sessions this can also introspect the parent authority session. Failures fail closed. */
    isSessionAllowed: (session: AuthSession) => boolean | Promise<boolean>;
    /** Dependency injection for a document-capable driver. Atomic findOneAndUpdate is required. */
    database?: () => Promise<DocumentDatabase>;
    /** ID handling for an injected document store; otherwise the selected driver owns IDs. */
    idAdapter?: DatabaseIdAdapter;
};

type SessionRecord = Omit<AuthSession, "id" | "subject"> & {
    _id: DatabaseId;
    _subject: DatabaseId;
    accessHash: string;
    refreshHash: string;
    csrfHash: string;
    usedRefreshHashes: string[];
    accessExpiresAt: number;
    revokedAt: number | null;
    credentialState?: { access: string; refresh: string; csrf: string };
};

function publicSession(record: SessionRecord): AuthSession {
    return { id: String(record._id), subject: String(record._subject), issuer: record.issuer, audience: record.audience, scope: record.scope,
        environment: record.environment, createdAt: record.createdAt, expiresAt: record.expiresAt, parent: record.parent,
        ...(record.userAgent !== undefined ? { userAgent: record.userAgent } : {}),
        ...(record.lastActiveAt !== undefined ? { lastActiveAt: record.lastActiveAt } : {}) };
}

function tokenSessionId(token: unknown): string | null {
    return typeof token === "string" && /^[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{43}$/.test(token) ? token.split(".")[0] : null;
}

/** Revocable, hashed, independently addressable device sessions. Legacy UserAuth is unaffected. */
export class SessionAuth {
    private readonly scope: { issuer: string; audience: string; scope: string; environment?: string | null };
    private readonly accessSeconds: number;
    private readonly sessionSeconds: number;
    private readonly idleSeconds: number | false;

    constructor(private readonly options: SessionAuthOptions) {
        this.scope = { issuer: authText(options.issuer, "issuer"), audience: authText(options.audience, "audience"), scope: authText(options.scope ?? "main", "scope"),
            ...(options.allowDynamicEnvironment && options.environment === undefined ? {}
                : { environment: options.environment === undefined ? null : authText(options.environment, "environment") }) };
        this.accessSeconds = authLifetime(options.accessTokenSeconds, 15 * 60);
        this.sessionSeconds = authLifetime(options.sessionSeconds, 30 * 86400);
        this.idleSeconds = options.idleTimeoutSeconds === undefined || options.idleTimeoutSeconds === false ? false : authLifetime(options.idleTimeoutSeconds, 7 * 86400);
        if (options.parentSessions?.mode === "reuse" && (typeof options.parentSessions.secret !== "string" || options.parentSessions.secret.length < 32)) {
            throw new Error("Parent session reuse requires a strong server secret.");
        }
        if (typeof options.isSessionAllowed !== "function") throw new Error("SessionAuth requires isSessionAllowed.");
    }

    private ids(): DatabaseIdAdapter {
        return this.options.idAdapter || DBConnection.getIdAdapter(this.options.connection);
    }

    private sessionId(value: string): DatabaseId | null {
        const adapter = this.ids();
        const native = adapter.normalize(value);
        // Converted legacy MongoDB sessions keep working with their existing opaque token prefix.
        return native ?? (/^[A-Za-z0-9_-]{43}$/.test(value) ? adapter.normalize(hashAuthToken(value).slice(0, 24)) : null);
    }

    private async rows() {
        const db = await (this.options.database ? this.options.database() : DBConnection.getDocumentStore(this.options.connection));
        return db.collection(this.options.collection || "auth_sessions");
    }

    private liveFilter(now = Date.now()): object {
        return { revokedAt: null, expiresAt: { $gt: now }, createdAt: { $gt: now - this.sessionSeconds * 1000 },
            ...(this.idleSeconds === false ? {} : { $and: [{ $or: [
                { lastActiveAt: { $gt: now - this.idleSeconds * 1000 } },
                { lastActiveAt: { $exists: false }, createdAt: { $gt: now - this.idleSeconds * 1000 } },
            ] }] }) };
    }

    private async allowed(record: SessionRecord | null): Promise<AuthSession | null> {
        if (!record || record.revokedAt !== null || !Number.isFinite(record.expiresAt) || Math.min(record.expiresAt, record.createdAt + this.sessionSeconds * 1000) <= Date.now()
            || (this.idleSeconds !== false && (record.lastActiveAt ?? record.createdAt) + this.idleSeconds * 1000 <= Date.now())) return null;
        const session = publicSession(record);
        return await this.options.isSessionAllowed(session) ? session : null;
    }

    private pair(record: SessionRecord, access: string, refresh: string): SessionTokenPair {
        return { auth_token: access, refresh_token: refresh, auth_expires_at: record.accessExpiresAt,
            refresh_expires_at: Math.min(record.expiresAt, record.createdAt + this.sessionSeconds * 1000), session: publicSession(record) };
    }

    private credentials(record: SessionRecord): { access: string; refresh: string; csrf: string } {
        if (!record.credentialState || !this.options.parentSessions?.secret) throw new Error("Linked session credentials are unavailable.");
        const context = JSON.stringify([String(record._id), String(record._subject), record.issuer, record.audience,
            record.scope, record.environment, record.parent?.issuer, record.parent?.sessionId]);
        const derive = (kind: "access" | "refresh" | "csrf") => createHmac("sha256", this.options.parentSessions!.secret!)
            .update(JSON.stringify(["webframez-parent-session-v1", context, kind, record.credentialState![kind]])).digest("base64url");
        return { access: `${record._id}.${derive("access")}`, refresh: `${record._id}.${derive("refresh")}`, csrf: derive("csrf") };
    }

    private async reuse(record: SessionRecord): Promise<CreatedAuthSession> {
        if (!await this.allowed(record)) throw new Error("Session is not allowed.");
        const credentials = this.credentials(record);
        if (hashAuthToken(credentials.access) !== record.accessHash || hashAuthToken(credentials.refresh) !== record.refreshHash
            || hashAuthToken(credentials.csrf) !== record.csrfHash) throw new Error("Linked session credentials have changed.");
        if (record.accessExpiresAt <= Date.now()) {
            await this.renewAccess(credentials.refresh);
            const current = await (await this.rows()).findOne({ _id: record._id, ...this.scope });
            if (!current || current.accessExpiresAt <= Date.now()) throw new Error("Linked session access could not be renewed.");
            return this.reuse(current);
        }
        const session = publicSession(record);
        await this.touch(session);
        return { ...this.pair(record, credentials.access, credentials.refresh), session, csrf_token: credentials.csrf, reused: true };
    }

    private async linkedRecord(record: SessionRecord): Promise<SessionRecord> {
        const db = await (this.options.database ? this.options.database() : DBConnection.getDocumentStore(this.options.connection));
        const links = db.collection(`${this.options.collection || "auth_sessions"}_links`);
        const key = hashAuthToken(JSON.stringify([record.issuer, record.audience, record.scope, String(record._subject),
            record.environment, record.parent!.issuer, record.parent!.sessionId]));
        let link;
        try {
            link = await links.findOneAndUpdate({ _id: key }, { $setOnInsert: { ...this.scope, environment: record.environment,
                sessionId: record._id, purgeAt: new Date(record.expiresAt) } }, { upsert: true, returnDocument: "after" });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
            link = await links.findOne({ _id: key });
        }
        if (!link) throw new Error("Linked session reference is unavailable.");
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = { ...record, _id: link.sessionId, accessExpiresAt: Math.min(record.accessExpiresAt, record.expiresAt) };
            const credentials = this.credentials(candidate);
            Object.assign(candidate, { accessHash: hashAuthToken(credentials.access), refreshHash: hashAuthToken(credentials.refresh), csrfHash: hashAuthToken(credentials.csrf) });
            let stored: SessionRecord | null;
            try {
                stored = await (await this.rows()).findOneAndUpdate({ _id: candidate._id }, { $setOnInsert: candidate }, { upsert: true, returnDocument: "after" });
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) throw error;
                stored = await (await this.rows()).findOne({ _id: candidate._id });
            }
            if (!stored) throw new Error("Linked session is unavailable.");
            // A denied parent or membership must fail closed, rather than create another session.
            if (stored.revokedAt === null && stored.expiresAt > Date.now()
                && stored.createdAt + this.sessionSeconds * 1000 > Date.now()
                && (this.idleSeconds === false || (stored.lastActiveAt ?? stored.createdAt) + this.idleSeconds * 1000 > Date.now())) return stored;
            link = await links.findOneAndUpdate({ _id: key, sessionId: stored._id },
                { $set: { sessionId: this.ids().create(), purgeAt: new Date(record.expiresAt) } }, { returnDocument: "after" })
                || await links.findOne({ _id: key });
        }
        throw new Error("Linked session could not be established.");
    }

    async create(subject: string, parent: AuthSession["parent"] = null, environment?: string, parentExpiresAt?: number): Promise<CreatedAuthSession> {
        authText(subject, "subject");
        if (environment !== undefined && (!this.options.allowDynamicEnvironment || this.options.environment !== undefined)) {
            throw new Error("Dynamic session environments are not enabled.");
        }
        if (parent) { authText(parent.issuer, "parent issuer"); authText(parent.sessionId, "parent session"); }
        if (parentExpiresAt !== undefined && (!parent || !Number.isFinite(parentExpiresAt) || parentExpiresAt <= Date.now())) {
            throw new Error("Invalid parent session expiry.");
        }
        const now = Date.now(), id = this.ids().create();
        const access = `${id}.${randomAuthToken()}`, refresh = `${id}.${randomAuthToken()}`, csrf = randomAuthToken();
        const record: SessionRecord = { _id: id, _subject: this.ids().create(subject), ...this.scope, environment: environment === undefined ? this.scope.environment ?? null : authText(environment, "environment"), parent: parent ? { ...parent } : null,
            createdAt: now, lastActiveAt: now, expiresAt: Math.min(now + this.sessionSeconds * 1000, parentExpiresAt ?? Infinity),
            accessExpiresAt: now + Math.min(this.accessSeconds, this.sessionSeconds) * 1000,
            accessHash: hashAuthToken(access), refreshHash: hashAuthToken(refresh), csrfHash: hashAuthToken(csrf),
            usedRefreshHashes: [], revokedAt: null };
        if (!await this.allowed(record)) throw new Error("Session is not allowed.");
        if (parent && this.options.parentSessions?.mode === "reuse") {
            record.credentialState = { access: randomAuthToken(), refresh: randomAuthToken(), csrf: randomAuthToken() };
            const stored = await this.linkedRecord(record);
            const pair = await this.reuse(stored);
            return { ...pair, reused: stored.credentialState?.access !== record.credentialState.access };
        }
        record.accessExpiresAt = Math.min(record.accessExpiresAt, record.expiresAt);
        await (await this.rows()).insertOne(record);
        return { ...this.pair(record, access, refresh), csrf_token: csrf };
    }

    async authenticate(token: string): Promise<AuthSession | null> {
        const id = tokenSessionId(token);
        if (!id) return null;
        const row = await (await this.rows()).findOne({ _id: this.sessionId(id), ...this.scope, ...this.liveFilter(), accessHash: hashAuthToken(token), accessExpiresAt: { $gt: Date.now() } });
        const session = await this.allowed(row);
        if (session && this.idleSeconds !== false) await this.touch(session);
        return session;
    }

    /** Trusted-server introspection; never expose this method as an unauthenticated endpoint. */
    async inspect(sessionId: string): Promise<AuthSession | null> {
        if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return null;
        return this.allowed(await (await this.rows()).findOne({ _id: this.sessionId(sessionId), ...this.scope }));
    }

    async verifyCsrf(token: string, csrf: string, kind: "access" | "refresh" = "access"): Promise<boolean> {
        const id = tokenSessionId(token);
        if (!id || typeof csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) return false;
        const row = await (await this.rows()).findOne({ _id: this.sessionId(id), ...this.scope,
            ...(kind === "access" ? { accessHash: hashAuthToken(token) } : { $or: [{ refreshHash: hashAuthToken(token) }, { usedRefreshHashes: hashAuthToken(token) }] }), csrfHash: hashAuthToken(csrf),
            ...(kind === "access" ? { accessExpiresAt: { $gt: Date.now() } } : {}) });
        return !!await this.allowed(row);
    }

    /** One winner under concurrency. A previously consumed refresh token revokes its device session. */
    async refresh(token: string): Promise<SessionTokenPair | null> {
        const id = tokenSessionId(token);
        if (!id) return null;
        const rows = await this.rows(), hash = hashAuthToken(token);
        const row: SessionRecord | null = await rows.findOne({ _id: this.sessionId(id), ...this.scope });
        if (!await this.allowed(row) || !row) return null;
        if (row.refreshHash !== hash) {
            if (row.usedRefreshHashes.includes(hash)) await this.revoke(id);
            return null;
        }
        // Bound history size and retain an absolute expiry instead of extending sessions indefinitely.
        if (row.usedRefreshHashes.length >= 4096) { await this.revoke(id); return null; }
        const credentialState = row.credentialState ? { ...row.credentialState, access: randomAuthToken(), refresh: randomAuthToken() } : undefined;
        const credentials = credentialState ? this.credentials({ ...row, credentialState }) : null;
        const access = credentials?.access ?? `${id}.${randomAuthToken()}`, refresh = credentials?.refresh ?? `${id}.${randomAuthToken()}`;
        const next = await rows.findOneAndUpdate({ _id: this.sessionId(id), ...this.scope, refreshHash: hash, ...this.liveFilter() },
            { $set: { ...(credentialState ? { credentialState } : {}), accessHash: hashAuthToken(access), refreshHash: hashAuthToken(refresh),
                accessExpiresAt: Math.min(Date.now() + this.accessSeconds * 1000, row.expiresAt, row.createdAt + this.sessionSeconds * 1000),
                lastActiveAt: Date.now(),
                usedRefreshHashes: [...row.usedRefreshHashes, hash] } }, { returnDocument: "after" });
        if (!next) {
            // Also detect simultaneous replay that lost the compare-and-swap.
            await rows.updateOne({ _id: this.sessionId(id), ...this.scope, usedRefreshHashes: hash, revokedAt: null }, { $set: { revokedAt: Date.now() } });
            return null;
        }
        return this.pair(next, access, refresh);
    }

    /** Trusted server refresh-secret lookup; never expose as a public endpoint. */
    async inspectRefresh(token: string): Promise<AuthSession | null> {
        const id = tokenSessionId(token);
        if (!id) return null;
        return this.allowed(await (await this.rows()).findOne({ _id: this.sessionId(id), ...this.scope,
            refreshHash: hashAuthToken(token), ...this.liveFilter() }));
    }

    /** Trusted browser GET resumption: renew access without consuming or replaying refresh rotation. */
    async renewAccess(token: string): Promise<SessionTokenPair | null> {
        const id = tokenSessionId(token);
        if (!id) return null;
        const rows = await this.rows();
        const filter = { _id: this.sessionId(id), ...this.scope, refreshHash: hashAuthToken(token), ...this.liveFilter(), accessExpiresAt: { $lte: Date.now() } };
        const row = await rows.findOne(filter);
        if (!row || !await this.allowed(row)) return null;
        const credentialState = row.credentialState ? { ...row.credentialState, access: randomAuthToken() } : undefined;
        const access = credentialState ? this.credentials({ ...row, credentialState }).access : `${id}.${randomAuthToken()}`, now = Date.now();
        const next = await rows.findOneAndUpdate(filter, { $set: { ...(credentialState ? { credentialState } : {}), accessHash: hashAuthToken(access),
            accessExpiresAt: Math.min(now + this.accessSeconds * 1000, row.expiresAt, row.createdAt + this.sessionSeconds * 1000),
            lastActiveAt: now } }, { returnDocument: "after" });
        const session = next ? await this.allowed(next) : null;
        return next && session ? { ...this.pair(next, access, token), session } : null;
    }

    /** Browser login metadata; arbitrary request data and token hashes are never exposed. */
    async recordLogin(session: AuthSession, userAgent: string): Promise<void> {
        const metadata = { userAgent: userAgent.slice(0, 512), lastActiveAt: session.createdAt };
        await (await this.rows()).updateOne({ _id: this.sessionId(session.id), ...this.scope, revokedAt: null }, { $set: metadata });
        Object.assign(session, metadata);
    }

    /** Persist activity with a one-minute throttle; authorization does not depend on this timestamp. */
    async touch(session: AuthSession): Promise<void> {
        const now = Date.now();
        if ((session.lastActiveAt ?? session.createdAt) >= now - (this.idleSeconds === false ? 60_000 : Math.min(60_000, this.idleSeconds * 250))) return;
        await (await this.rows()).updateOne({ _id: this.sessionId(session.id), ...this.scope, ...this.liveFilter(now) },
            { $max: { lastActiveAt: now } });
        session.lastActiveAt = now;
    }

    async revoke(sessionId: string): Promise<void> {
        authText(sessionId, "session ID");
        await (await this.rows()).updateOne({ _id: this.sessionId(sessionId), ...this.scope, revokedAt: null }, { $set: { revokedAt: Date.now() } });
    }

    async revokeAll(subject: string): Promise<void> {
        authText(subject, "subject");
        await (await this.rows()).updateMany({ _subject: this.ids().create(subject), ...this.scope, revokedAt: null }, { $set: { revokedAt: Date.now() } });
    }

    async list(subject: string): Promise<AuthSession[]> {
        authText(subject, "subject");
        const rows: SessionRecord[] = await (await this.rows()).find({ _subject: this.ids().create(subject), ...this.scope, ...this.liveFilter() }).toArray();
        return rows.map(publicSession);
    }

    /** Run periodically; authorization checks never depend on cleanup scheduling. */
    async cleanup(): Promise<void> {
        const now = Date.now();
        await (await this.rows()).deleteMany({ ...this.scope, $or: [
            { expiresAt: { $lte: now } }, { createdAt: { $lte: now - this.sessionSeconds * 1000 } },
            ...(this.idleSeconds === false ? [] : [
                { lastActiveAt: { $lte: now - this.idleSeconds * 1000 } },
                { lastActiveAt: { $exists: false }, createdAt: { $lte: now - this.idleSeconds * 1000 } },
            ]),
        ] });
    }
}
