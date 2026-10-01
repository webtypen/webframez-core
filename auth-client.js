/** Browser-only entry point. No server or database modules are loaded. */
function csrfCookie(name) {
    const cookieName = name || (window.location.protocol === "https:" ? "__Host-wf_csrf" : "wf_dev_csrf");
    const values = document.cookie.split(";").map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
    return values.length === 1 ? decodeURIComponent(values[0].slice(cookieName.length + 1)) : "";
}

exports.createAuthFetch = function createAuthFetch(options = {}, originalFetch = window.fetch.bind(window)) {
    const base = (options.basePath || "/api/auth").replace(/\/+$/, "");
    const loginPaths = options.loginPaths || [`${base}/login`];
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
        return originalFetch(input, { ...init, headers });
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
