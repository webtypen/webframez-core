const path = require("node:path");
const fs = require("node:fs");

/** Preserve the platform's FileStore subclass (including Expo CSS handling). */
function configureMetroCache(config, env = process.env) {
    if (env.WEBFRAMEZ_BUILD_MAX_WORKERS !== undefined) {
        const workers = Number(env.WEBFRAMEZ_BUILD_MAX_WORKERS);
        if (!Number.isInteger(workers) || workers < 1 || workers > 64) throw new Error("Invalid WEBFRAMEZ_BUILD_MAX_WORKERS");
        config.maxWorkers = workers;
    }
    if (!env.WEBFRAMEZ_METRO_CACHE_DIRECTORY) return config;
    const root = path.resolve(env.WEBFRAMEZ_METRO_CACHE_DIRECTORY);
    const relocate = stores => stores.map((store, index) => {
        // Leave remote and custom stores untouched; their constructors need other options.
        if (!store || typeof store._root !== "string") return store;
        return new store.constructor({root:path.join(root, `transform-${index}`)});
    });
    const stores = config.cacheStores;
    config.cacheStores = typeof stores === "function" ? cache => relocate(stores(cache)) : relocate(stores || []);
    const field = "fileMapCacheDirectory" in config ? "fileMapCacheDirectory" : "hasteMapCacheDirectory";
    config[field] = path.join(root, "file-map");
    fs.mkdirSync(config[field], {recursive:true});
    return config;
}

module.exports = {configureMetroCache};
