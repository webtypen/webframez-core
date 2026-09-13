"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appRelativePath = exports.appPath = exports.getBasename = exports.normalizeBasename = void 0;
function normalizeBasename(value) {
    if (value == null || value === "" || value === "/")
        return "";
    if (typeof value !== "string")
        throw new Error("Router basename must be a string.");
    const base = value.trim().replace(/\/+$/, "");
    if (!base && value.trim().length <= 1)
        return "";
    if (!/^\/(?:[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_~-]+)*)(?:\/[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_~-]+)*)*$/.test(base)) {
        throw new Error("Router basename must be empty or an absolute path such as /my-app.");
    }
    return base;
}
exports.normalizeBasename = normalizeBasename;
function getBasename() {
    var _a, _b, _c, _d;
    const runtime = globalThis;
    return (_d = (_c = (_b = (_a = runtime.__WEBFRAMEZ_ROUTING_CONTEXT__) === null || _a === void 0 ? void 0 : _a.getStore()) !== null && _b !== void 0 ? _b : runtime.__RSC_BASENAME) !== null && _c !== void 0 ? _c : runtime.__WEBFRAMEZ_ROUTER_BASENAME__) !== null && _d !== void 0 ? _d : "";
}
exports.getBasename = getBasename;
/** Prefix application-absolute URLs once; preserve external and relative URLs. */
function appPath(value, basename = getBasename()) {
    const base = normalizeBasename(basename);
    if (!base || !value.startsWith("/") || value.startsWith("//") || hasBasename(value, base))
        return value;
    return base + value;
}
exports.appPath = appPath;
function appRelativePath(value, basename = getBasename()) {
    const base = normalizeBasename(basename);
    if (!base || !hasBasename(value, base))
        return value;
    const relative = value.slice(base.length);
    return !relative || relative.startsWith("?") || relative.startsWith("#") ? "/" + relative : relative;
}
exports.appRelativePath = appRelativePath;
function hasBasename(value, base) {
    return value === base || value.startsWith(base + "/") || value.startsWith(base + "?") || value.startsWith(base + "#");
}
