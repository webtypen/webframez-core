/** Browser/native entry point; imports no server or database code. */
exports.createBearerAuthFetch = function createBearerAuthFetch(options, originalFetch = globalThis.fetch.bind(globalThis)) {
    const pending = new Map();
    const refresh = (configuration, failedToken) => {
        const key = configuration.key;
        const perform = async () => {
            const current = await options.load(key);
            if (!current) return null;
            if (failedToken && current.auth_token !== failedToken) return current;
            let response;
            try {
                response = await originalFetch(configuration.refreshUrl, { method: "POST", credentials: "omit",
                    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: current.refresh_token }),
                    redirect: "error", signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(15000) : undefined });
            } catch (error) {
                // A timeout may have consumed the rotating token; never replay it automatically.
                if (options.clear) await options.clear(key);
                return null;
            }
            if (!response.ok) {
                if (options.clear) await options.clear(key);
                return null;
            }
            let pair;
            try { pair = await response.json(); }
            catch { if (options.clear) await options.clear(key); return null; }
            if (pair.status !== "success" || typeof pair.auth_token !== "string" || typeof pair.refresh_token !== "string"
                || !Number.isFinite(pair.auth_expires_at) || !Number.isFinite(pair.refresh_expires_at)) {
                if (options.clear) await options.clear(key);
                return null;
            }
            const latest = await options.load(key);
            if (!latest || latest.refresh_token !== current.refresh_token) return latest;
            await options.save(key, pair);
            return pair;
        };
        if (!pending.has(key)) {
            const task = typeof navigator !== "undefined" && navigator.locks
                ? navigator.locks.request(`webframez-bearer:${key}`, perform) : perform();
            pending.set(key, task.finally(() => pending.delete(key)));
        }
        return pending.get(key);
    };
    return async (input, init) => {
        let url;
        try { url = new URL(typeof Request !== "undefined" && input instanceof Request ? input.url : String(input), globalThis.location?.href); }
        catch { return originalFetch(input, init); }
        const configuration = options.configuration(url);
        if (!configuration) return originalFetch(input, init);
        const refreshUrl = new URL(configuration.refreshUrl);
        if (refreshUrl.origin !== url.origin) throw new Error("Bearer refresh must use the request origin.");
        let session = await options.load(configuration.key);
        if (!session || url.href === refreshUrl.href) return originalFetch(input, init);
        if (session.auth_expires_at <= Date.now() + 30000) session = await refresh(configuration, session.auth_token) || session;
        const headers = new Headers(init?.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
        headers.set("Authorization", `Bearer ${session.auth_token}`);
        const retryInput = typeof Request !== "undefined" && input instanceof Request ? input.clone() : input;
        const response = await originalFetch(input, { ...init, headers, credentials: "omit", redirect: "error" });
        if (response.status !== 401) return response;
        const failure = await response.clone().json().catch(() => null);
        if (failure?.code !== "unauthorized") return response;
        const renewed = await refresh(configuration, session.auth_token);
        if (!renewed) return response;
        headers.set("Authorization", `Bearer ${renewed.auth_token}`);
        return originalFetch(retryInput, { ...init, headers, credentials: "omit", redirect: "error" });
    };
};
