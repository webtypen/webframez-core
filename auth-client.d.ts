/** Public browser-only entry point for ModelAuth / Route.auth. */
export type AuthClientOptions = {
    basePath?: string;
    loginPaths?: string[];
    cookieName?: string;
    requiresCsrf?: (url: URL) => boolean;
};

export declare function createAuthFetch(options?: AuthClientOptions, originalFetch?: typeof fetch): typeof fetch;

export declare function installAuthForms(options?: AuthClientOptions & { fetch?: typeof fetch }): () => void;
