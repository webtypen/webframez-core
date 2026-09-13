/** Browser-safe URL helpers shared by Core and its rendering adapters. */
type RoutingRuntime = {
    __WEBFRAMEZ_ROUTER_BASENAME__?: string;
    __WEBFRAMEZ_ROUTING_CONTEXT__?: { getStore(): string | undefined };
    __RSC_BASENAME?: string;
};

export function normalizeBasename(value?: string | null): string {
    if (value == null || value === "" || value === "/") return "";
    if (typeof value !== "string") throw new Error("Router basename must be a string.");
    const base = value.trim().replace(/\/+$/, "");
    if (!base && value.trim().length <= 1) return "";
    if (!/^\/(?:[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_~-]+)*)(?:\/[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_~-]+)*)*$/.test(base)) {
        throw new Error("Router basename must be empty or an absolute path such as /my-app.");
    }
    return base;
}

export function getBasename(): string {
    const runtime = globalThis as RoutingRuntime;
    return runtime.__WEBFRAMEZ_ROUTING_CONTEXT__?.getStore()
        ?? runtime.__RSC_BASENAME
        ?? runtime.__WEBFRAMEZ_ROUTER_BASENAME__
        ?? "";
}

/** Prefix application-absolute URLs once; preserve external and relative URLs. */
export function appPath(value: string, basename = getBasename()): string {
    const base = normalizeBasename(basename);
    if (!base || !value.startsWith("/") || value.startsWith("//") || hasBasename(value, base)) return value;
    return base + value;
}

export function appRelativePath(value: string, basename = getBasename()): string {
    const base = normalizeBasename(basename);
    if (!base || !hasBasename(value, base)) return value;
    const relative = value.slice(base.length);
    return !relative || relative.startsWith("?") || relative.startsWith("#") ? "/" + relative : relative;
}

function hasBasename(value: string, base: string): boolean {
    return value === base || value.startsWith(base + "/") || value.startsWith(base + "?") || value.startsWith(base + "#");
}
