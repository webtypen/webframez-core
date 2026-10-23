const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {configureMetroCache} = require("../build-cache");

test("Metro cache preserves Expo stores, custom stores and legacy configuration", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "metro-config-"));
    t.after(() => fs.rmSync(root, {recursive:true, force:true}));
    class FileStore { constructor({root}) { this._root = root; } }
    class ExpoStore extends FileStore {}
    const remote = {get() {}, set() {}};
    const config = {cacheStores:[new ExpoStore({root:"/tmp/old"}),remote]};
    configureMetroCache(config, {WEBFRAMEZ_METRO_CACHE_DIRECTORY:root, WEBFRAMEZ_BUILD_MAX_WORKERS:"2"});
    assert.ok(config.cacheStores[0] instanceof ExpoStore);
    assert.equal(config.cacheStores[1], remote);
    assert.equal(config.hasteMapCacheDirectory, path.join(root,"file-map"));
    assert.equal(config.maxWorkers, 2);
    const modern = {fileMapCacheDirectory:undefined, cacheStores:() => [new ExpoStore({root:"/tmp/old"})]};
    configureMetroCache(modern, {WEBFRAMEZ_METRO_CACHE_DIRECTORY:root});
    assert.equal(modern.fileMapCacheDirectory, path.join(root,"file-map"));
    assert.ok(modern.cacheStores({})[0] instanceof ExpoStore);
});
