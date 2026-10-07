export type BearerAuthTokens = {
    auth_token: string;
    refresh_token: string;
    auth_expires_at: number;
    refresh_expires_at: number;
};

/** Override one request's transport (e.g. XHR upload progress); refreshes keep the original fetch and shared refresh lock. */
export type BearerAuthFetch = (input: Parameters<typeof fetch>[0], init?: RequestInit, requestFetch?: typeof fetch) => Promise<Response>;

export function createBearerAuthFetch(options: {
    configuration: (url: URL) => { key: string; refreshUrl: string } | null;
    load: (key: string) => Promise<BearerAuthTokens | null>;
    clear?: (key: string) => Promise<void>;
    save: (key: string, tokens: BearerAuthTokens) => Promise<void>;
}, originalFetch?: typeof fetch): BearerAuthFetch;
