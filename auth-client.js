/** Browser-only entry point. No server or database modules are loaded. */
function csrfCookie(name) {
    const cookieName = name || (window.location.protocol === "https:" ? "__Host-wf_csrf" : "wf_dev_csrf");
    const values = document.cookie.split(";").map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
    return values.length === 1 ? decodeURIComponent(values[0].slice(cookieName.length + 1)) : "";
}

exports.createAuthFetch = function createAuthFetch(options = {}, originalFetch = window.fetch.bind(window)) {
    const base = (options.basePath || "/api/auth").replace(/\/+$/, "");
    const loginPaths = options.loginPaths || [`${base}/login`];
    let refreshing;
    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.origin !== window.location.origin || ["GET", "HEAD", "OPTIONS"].includes(method)
            || (options.requiresCsrf && !options.requiresCsrf(url))) return originalFetch(input, init);
        let token;
        if (loginPaths.includes(url.pathname)) {
            const bootstrap = await originalFetch(`${base}/csrf`, { credentials: "same-origin", cache: "no-store" });
            if (!bootstrap.ok) return bootstrap;
            token = (await bootstrap.json()).csrf;
        } else token = csrfCookie(options.cookieName);
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (typeof token === "string" && token) headers.set("X-CSRF-Token", token);
        const retryInput = input instanceof Request ? input.clone() : input;
        const response = await originalFetch(input, { ...init, headers });
        if (loginPaths.includes(url.pathname) || url.pathname.startsWith(`${base}/`)
            || ![401, 403].includes(response.status)) return response;
        const failure = await response.clone().json().catch(() => null);
        if (!["unauthorized", "invalid_csrf"].includes(failure?.code)) return response;
        const performRefresh = () => {
            const refreshHeaders = new Headers();
            const csrf = csrfCookie(options.cookieName);
            if (csrf) refreshHeaders.set("X-CSRF-Token", csrf);
            return originalFetch(`${base}/refresh`, { method: "POST", credentials: "same-origin", headers: refreshHeaders });
        };
        const retry = () => {
            const nextCsrf = csrfCookie(options.cookieName);
            if (nextCsrf) headers.set("X-CSRF-Token", nextCsrf);
            return originalFetch(retryInput, { ...init, headers });
        };
        if (typeof navigator !== "undefined" && navigator.locks) {
            // Hold the shared tab lock through the retry so another refresh cannot invalidate it.
            return navigator.locks.request(`webframez-auth:${base}`, async () => {
                const renewed = await performRefresh().then(result => result.ok, () => false);
                return renewed ? retry() : response;
            });
        }
        if (!refreshing) {
            refreshing = performRefresh().then(result => result.ok, () => false)
                .finally(() => { refreshing = undefined; });
        }
        if (!await refreshing) return response;
        return retry();
    };
};

exports.installAuthForms = function installAuthForms(options = {}) {
    const loginPaths = options.loginPaths || ["/api/auth/login"];
    const fetch = options.fetch || window.fetch.bind(window);
    const listener = event => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "post") return;
        const url = new URL(form.action);
        if (url.origin !== window.location.origin || !loginPaths.includes(url.pathname)) return;
        const token = csrfCookie(options.cookieName);
        if (!token) {
            event.preventDefault();
            const submitter = event.submitter;
            void fetch(`${(options.basePath || "/api/auth").replace(/\/+$/, "")}/csrf`, { credentials: "same-origin", cache: "no-store" })
                .then(response => { if (response.ok && csrfCookie(options.cookieName)) form.requestSubmit(submitter); });
            return;
        }
        let field = form.querySelector('input[name="_csrf"]');
        if (!field) { field = document.createElement("input"); field.type = "hidden"; field.name = "_csrf"; form.append(field); }
        field.value = token;
    };
    document.addEventListener("submit", listener, true);
    return () => document.removeEventListener("submit", listener, true);
};
