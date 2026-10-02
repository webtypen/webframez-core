export type BearerAuthTokens = {
    auth_token: string;
    refresh_token: string;
    auth_expires_at: number;
    refresh_expires_at: number;
};

export function createBearerAuthFetch(options: {
    configuration: (url: URL) => { key: string; refreshUrl: string } | null;
    load: (key: string) => Promise<BearerAuthTokens | null>;
    clear?: (key: string) => Promise<void>;
    save: (key: string, tokens: BearerAuthTokens) => Promise<void>;
}, originalFetch?: typeof fetch): typeof fetch;
