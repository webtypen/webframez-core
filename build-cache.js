const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

/** Preserve the platform's FileStore subclass (including Expo CSS handling). */
function configureMetroCache(config, env = process.env) {
    // Expo inlines public values into transforms. Metro's persistent cache must
    // not share those transforms between origins or feature configurations.
    const publicEnvironment = Object.keys(env)
        .filter(key => key.startsWith("EXPO_PUBLIC_") || key === "NODE_ENV" || key === "BABEL_ENV")
        .sort()
        .map(key => [key, env[key]]);
    const environmentKey = crypto.createHash("sha256").update(JSON.stringify(publicEnvironment)).digest("hex");
    config.cacheVersion = `${config.cacheVersion || "1.0"}:webframez-public-env-v1:${environmentKey}`;


    if (env.WEBFRAMEZ_BUILD_MAX_WORKERS !== undefined) {
        const workers = Number(env.WEBFRAMEZ_BUILD_MAX_WORKERS);
        if (!Number.isInteger(workers) || workers < 1 || workers > 64) throw new Error("Invalid WEBFRAMEZ_BUILD_MAX_WORKERS");
        config.maxWorkers = workers;
    }
    if (!env.WEBFRAMEZ_METRO_CACHE_DIRECTORY) return config;
    const root = path.join(path.resolve(env.WEBFRAMEZ_METRO_CACHE_DIRECTORY), `env-${environmentKey}`);
    const relocate = stores => stores.map((store, index) => {
        // Leave remote and custom stores untouched; their constructors need other options.
        if (!store || typeof store._root !== "string") return store;
        return new store.constructor({root:path.join(root, `transform-${index}`)});
    });
    const stores = config.cacheStores;
    config.cacheStores = typeof stores === "function" ? cache => relocate(stores(cache)) : relocate(stores || []);
    // Some Metro releases accept these options at runtime but reject them in
    // their schema. Only extend a field exposed by the caller/default config.
    const field = "fileMapCacheDirectory" in config ? "fileMapCacheDirectory" : "hasteMapCacheDirectory" in config ? "hasteMapCacheDirectory" : null;
    if (field) {
        config[field] = path.join(root, "file-map");
        fs.mkdirSync(config[field], {recursive:true});
    }
    return config;
}

module.exports = {configureMetroCache};
