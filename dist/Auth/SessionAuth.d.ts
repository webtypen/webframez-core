import type { DatabaseIdAdapter, DocumentDatabase } from "../Database/DatabaseAdapter";
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
    parent: {
        issuer: string;
        sessionId: string;
    } | null;
};
export type SessionTokenPair = {
    auth_token: string;
    refresh_token: string;
    auth_expires_at: number;
    refresh_expires_at: number;
    session: AuthSession;
};
export type CreatedAuthSession = SessionTokenPair & {
    csrf_token: string;
};
export type SessionAuthOptions = {
    issuer: string;
    audience: string;
    scope?: string;
    environment?: string;
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
/** Revocable, hashed, independently addressable device sessions. Legacy UserAuth is unaffected. */
export declare class SessionAuth {
    private readonly options;
    private readonly scope;
    private readonly accessSeconds;
    private readonly sessionSeconds;
    private readonly idleSeconds;
    constructor(options: SessionAuthOptions);
    private ids;
    private sessionId;
    private rows;
    private liveFilter;
    private allowed;
    private pair;
    create(subject: string, parent?: AuthSession["parent"]): Promise<CreatedAuthSession>;
    authenticate(token: string): Promise<AuthSession | null>;
    /** Trusted-server introspection; never expose this method as an unauthenticated endpoint. */
    inspect(sessionId: string): Promise<AuthSession | null>;
    verifyCsrf(token: string, csrf: string, kind?: "access" | "refresh"): Promise<boolean>;
    /** One winner under concurrency. A previously consumed refresh token revokes its device session. */
    refresh(token: string): Promise<SessionTokenPair | null>;
    /** Trusted browser GET resumption: renew access without consuming or replaying refresh rotation. */
    renewAccess(token: string): Promise<SessionTokenPair | null>;
    /** Browser login metadata; arbitrary request data and token hashes are never exposed. */
    recordLogin(session: AuthSession, userAgent: string): Promise<void>;
    /** Persist activity with a one-minute throttle; authorization does not depend on this timestamp. */
    touch(session: AuthSession): Promise<void>;
    revoke(sessionId: string): Promise<void>;
    revokeAll(subject: string): Promise<void>;
    list(subject: string): Promise<AuthSession[]>;
    /** Run periodically; authorization checks never depend on cleanup scheduling. */
    cleanup(): Promise<void>;
}
