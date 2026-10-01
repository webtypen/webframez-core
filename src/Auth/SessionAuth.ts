import { DBConnection } from "../Database/DBConnection";
import type { DocumentDatabase } from "../Database/DatabaseAdapter";
import { authLifetime, authText, hashAuthToken, randomAuthToken } from "./AuthSecurity";

export type AuthSession = {
    id: string;
    subject: string;
    issuer: string;
    audience: string;
    environment: string | null;
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

export type CreatedAuthSession = SessionTokenPair & { csrf_token: string };

export type SessionAuthOptions = {
    issuer: string;
    audience: string;
    environment?: string;
    connection?: string;
    collection?: string;
    accessTokenSeconds?: number;
    sessionSeconds?: number;
    /** Called on creation, authentication and refresh. Check account status and tenant membership here.
     * For federated sessions this can also introspect the parent authority session. Failures fail closed. */
    isSessionAllowed: (session: AuthSession) => boolean | Promise<boolean>;
    /** Dependency injection for a document-capable driver. Atomic findOneAndUpdate is required. */
    database?: () => Promise<DocumentDatabase>;
};

type SessionRecord = AuthSession & {
    _id: string;
    accessHash: string;
    refreshHash: string;
    csrfHash: string;
    usedRefreshHashes: string[];
    accessExpiresAt: number;
    revokedAt: number | null;
};

function publicSession(record: AuthSession): AuthSession {
    return { id: record.id, subject: record.subject, issuer: record.issuer, audience: record.audience,
        environment: record.environment, createdAt: record.createdAt, expiresAt: record.expiresAt, parent: record.parent };
}

function tokenSessionId(token: unknown): string | null {
    return typeof token === "string" && /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token) ? token.split(".")[0] : null;
}

/** Revocable, hashed, independently addressable device sessions. Legacy UserAuth is unaffected. */
export class SessionAuth {
    private readonly scope: { issuer: string; audience: string; environment: string | null };
    private readonly accessSeconds: number;
    private readonly sessionSeconds: number;

    constructor(private readonly options: SessionAuthOptions) {
        this.scope = { issuer: authText(options.issuer, "issuer"), audience: authText(options.audience, "audience"),
            environment: options.environment === undefined ? null : authText(options.environment, "environment") };
        this.accessSeconds = authLifetime(options.accessTokenSeconds, 15 * 60);
        this.sessionSeconds = authLifetime(options.sessionSeconds, 30 * 86400);
        if (typeof options.isSessionAllowed !== "function") throw new Error("SessionAuth requires isSessionAllowed.");
    }

    private async rows() {
        const db = await (this.options.database ? this.options.database() : DBConnection.getDocumentStore(this.options.connection));
        return db.collection(this.options.collection || "auth_sessions");
    }

    private async allowed(record: SessionRecord | null): Promise<AuthSession | null> {
        if (!record || record.revokedAt !== null || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()) return null;
        const session = publicSession(record);
        return await this.options.isSessionAllowed(session) ? session : null;
    }

    private pair(record: SessionRecord, access: string, refresh: string): SessionTokenPair {
        return { auth_token: access, refresh_token: refresh, auth_expires_at: record.accessExpiresAt,
            refresh_expires_at: record.expiresAt, session: publicSession(record) };
    }

    async create(subject: string, parent: AuthSession["parent"] = null): Promise<CreatedAuthSession> {
        authText(subject, "subject");
        if (parent) { authText(parent.issuer, "parent issuer"); authText(parent.sessionId, "parent session"); }
        const now = Date.now(), id = randomAuthToken();
        const access = `${id}.${randomAuthToken()}`, refresh = `${id}.${randomAuthToken()}`, csrf = randomAuthToken();
        const record: SessionRecord = { _id: id, id, subject, ...this.scope, parent: parent ? { ...parent } : null,
            createdAt: now, expiresAt: now + this.sessionSeconds * 1000,
            accessExpiresAt: now + Math.min(this.accessSeconds, this.sessionSeconds) * 1000,
            accessHash: hashAuthToken(access), refreshHash: hashAuthToken(refresh), csrfHash: hashAuthToken(csrf),
            usedRefreshHashes: [], revokedAt: null };
        if (!await this.allowed(record)) throw new Error("Session is not allowed.");
        await (await this.rows()).insertOne(record);
        return { ...this.pair(record, access, refresh), csrf_token: csrf };
    }

    async authenticate(token: string): Promise<AuthSession | null> {
        const id = tokenSessionId(token);
        if (!id) return null;
        const row = await (await this.rows()).findOne({ _id: id, ...this.scope, accessHash: hashAuthToken(token), accessExpiresAt: { $gt: Date.now() } });
        return this.allowed(row);
    }

    /** Trusted-server introspection; never expose this method as an unauthenticated endpoint. */
    async inspect(sessionId: string): Promise<AuthSession | null> {
        if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) return null;
        return this.allowed(await (await this.rows()).findOne({ _id: sessionId, ...this.scope }));
    }

    async verifyCsrf(token: string, csrf: string, kind: "access" | "refresh" = "access"): Promise<boolean> {
        const id = tokenSessionId(token);
        if (!id || typeof csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) return false;
        const row = await (await this.rows()).findOne({ _id: id, ...this.scope,
            ...(kind === "access" ? { accessHash: hashAuthToken(token) } : { $or: [{ refreshHash: hashAuthToken(token) }, { usedRefreshHashes: hashAuthToken(token) }] }), csrfHash: hashAuthToken(csrf),
            ...(kind === "access" ? { accessExpiresAt: { $gt: Date.now() } } : {}) });
        return !!await this.allowed(row);
    }

    /** One winner under concurrency. A previously consumed refresh token revokes its device session. */
    async refresh(token: string): Promise<SessionTokenPair | null> {
        const id = tokenSessionId(token);
        if (!id) return null;
        const rows = await this.rows(), hash = hashAuthToken(token);
        const row: SessionRecord | null = await rows.findOne({ _id: id, ...this.scope });
        if (!await this.allowed(row) || !row) return null;
        if (row.refreshHash !== hash) {
            if (row.usedRefreshHashes.includes(hash)) await this.revoke(id);
            return null;
        }
        // Bound history size and retain an absolute expiry instead of extending sessions indefinitely.
        if (row.usedRefreshHashes.length >= 4096) { await this.revoke(id); return null; }
        const access = `${id}.${randomAuthToken()}`, refresh = `${id}.${randomAuthToken()}`;
        const next = await rows.findOneAndUpdate({ _id: id, ...this.scope, refreshHash: hash, revokedAt: null, expiresAt: { $gt: Date.now() } },
            { $set: { accessHash: hashAuthToken(access), refreshHash: hashAuthToken(refresh),
                accessExpiresAt: Math.min(Date.now() + this.accessSeconds * 1000, row.expiresAt),
                usedRefreshHashes: [...row.usedRefreshHashes, hash] } }, { returnDocument: "after" });
        if (!next) {
            // Also detect simultaneous replay that lost the compare-and-swap.
            await rows.updateOne({ _id: id, ...this.scope, usedRefreshHashes: hash, revokedAt: null }, { $set: { revokedAt: Date.now() } });
            return null;
        }
        return this.pair(next, access, refresh);
    }

    async revoke(sessionId: string): Promise<void> {
        authText(sessionId, "session ID");
        await (await this.rows()).updateOne({ _id: sessionId, ...this.scope, revokedAt: null }, { $set: { revokedAt: Date.now() } });
    }

    async revokeAll(subject: string): Promise<void> {
        authText(subject, "subject");
        await (await this.rows()).updateMany({ subject, ...this.scope, revokedAt: null }, { $set: { revokedAt: Date.now() } });
    }

    async list(subject: string): Promise<AuthSession[]> {
        authText(subject, "subject");
        const rows: SessionRecord[] = await (await this.rows()).find({ subject, ...this.scope, revokedAt: null, expiresAt: { $gt: Date.now() } }).toArray();
        return rows.map(publicSession);
    }

    /** Run periodically; authorization checks never depend on cleanup scheduling. */
    async cleanup(): Promise<void> {
        await (await this.rows()).deleteMany({ ...this.scope, expiresAt: { $lte: Date.now() } });
    }
}
