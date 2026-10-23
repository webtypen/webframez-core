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
    const config = {hasteMapCacheDirectory:undefined, cacheStores:[new ExpoStore({root:"/tmp/old"}),remote]};
    configureMetroCache(config, {WEBFRAMEZ_METRO_CACHE_DIRECTORY:root, WEBFRAMEZ_BUILD_MAX_WORKERS:"2"});
    assert.ok(config.cacheStores[0] instanceof ExpoStore);
    assert.equal(config.cacheStores[1], remote);
    assert.equal(config.hasteMapCacheDirectory, path.join(path.dirname(config.cacheStores[0]._root),"file-map"));
    assert.equal(config.maxWorkers, 2);
    const modern = {fileMapCacheDirectory:undefined, cacheStores:() => [new ExpoStore({root:"/tmp/old"})]};
    configureMetroCache(modern, {WEBFRAMEZ_METRO_CACHE_DIRECTORY:root});
    assert.equal(modern.fileMapCacheDirectory, config.hasteMapCacheDirectory);
    assert.ok(modern.cacheStores({})[0] instanceof ExpoStore);
});


test("Metro configs without file-map schema fields retain only supported options",()=>{
    const config={cacheStores:[]};
    configureMetroCache(config,{WEBFRAMEZ_METRO_CACHE_DIRECTORY:"/tmp/cache"});
    assert.equal("fileMapCacheDirectory" in config,false);
    assert.equal("hasteMapCacheDirectory" in config,false);
});


test("public build values isolate cached transforms across origins and flags without exposing values", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "metro-origins-"));
    t.after(() => fs.rmSync(root, {recursive:true, force:true}));
    class FileStore { constructor({root}) { this._root = root; } }
    const config = env => configureMetroCache({cacheVersion:"custom", cacheStores:[new FileStore({root:"/tmp/old"})]}, {WEBFRAMEZ_METRO_CACHE_DIRECTORY:root,...env});
    const production = config({EXPO_PUBLIC_API_URL:"https://instance1.example.test",EXPO_PUBLIC_MLS_CHANNELS:"0",NODE_AUTH_TOKEN:"not-a-real-token"});
    const dev = config({EXPO_PUBLIC_API_URL:"https://dev.example.test",EXPO_PUBLIC_MLS_CHANNELS:"1"});
    const stable = config({NODE_AUTH_TOKEN:"another-not-real-token",EXPO_PUBLIC_MLS_CHANNELS:"0",EXPO_PUBLIC_API_URL:"https://instance1.example.test"});
    assert.notEqual(production.cacheVersion,dev.cacheVersion);
    assert.notEqual(production.cacheStores[0]._root,dev.cacheStores[0]._root);
    assert.equal(production.cacheVersion,stable.cacheVersion);
    assert.equal(production.cacheStores[0]._root,stable.cacheStores[0]._root);
    assert.notEqual(dev.cacheVersion,config({EXPO_PUBLIC_API_URL:"https://dev.example.test",EXPO_PUBLIC_MLS_CHANNELS:"0"}).cacheVersion);
    assert.ok(!dev.cacheVersion.includes("dev.example.test"));
    assert.ok(!production.cacheStores[0]._root.includes("instance1.example.test"));
    const remote = {get() {},set() {}};
    const a=configureMetroCache({cacheStores:[remote]}, {EXPO_PUBLIC_API_URL:"https://a.example.test"});
    const b=configureMetroCache({cacheStores:[remote]}, {EXPO_PUBLIC_API_URL:"https://b.example.test"});
    assert.equal(a.cacheStores[0],remote);
    assert.notEqual(a.cacheVersion,b.cacheVersion);
});
