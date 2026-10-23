const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {BuildApplication} = require("../dist/BuildApplication");

test("incremental build reuses compiler output, removes deleted files and preserves the last good release on errors", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "core-incremental-"));
    t.after(() => fs.rm(root, {recursive:true, force:true}));
    await fs.mkdir(path.join(root,"node_modules",".bin"), {recursive:true});
    await fs.symlink(require.resolve("typescript/bin/tsc"), path.join(root,"node_modules",".bin","tsc"));
    await fs.writeFile(path.join(root,"tsconfig.json"), JSON.stringify({compilerOptions:{target:"ES2020",module:"CommonJS",strict:true,skipLibCheck:true,types:[],outDir:"build",rootDir:"src"},include:["src/**/*.ts"]}));
    await fs.mkdir(path.join(root,"src"));
    await fs.writeFile(path.join(root,"src","app.ts"), 'export const value: number = 1;');
    await fs.writeFile(path.join(root,"src","removed.ts"), 'export const removed = true;');
    const config = {build:{cacheDirectory:".webframez-cache",runtimeFiles:[]}};
    const build = () => new BuildApplication(root, config, {outDir:"build"}).run();
    await build();
    assert.match(await fs.readFile(path.join(root,"build","app.js"),"utf8"), /value = 1/);
    await build();
    await fs.rm(path.join(root,"src","removed.ts"));
    await fs.writeFile(path.join(root,"src","app.ts"), 'export const value: number = 2;');
    await build();
    await assert.rejects(fs.stat(path.join(root,"build","removed.js")), {code:"ENOENT"});
    await fs.writeFile(path.join(root,"src","app.ts"), 'export const value: number = "invalid";');
    await assert.rejects(build(), /tsc exited/);
    assert.match(await fs.readFile(path.join(root,"build","app.js"),"utf8"), /value = 2/);
    await fs.writeFile(path.join(root,"src","app.ts"), 'export const value: number = 3;');
    await build();
    assert.match(await fs.readFile(path.join(root,"build","app.js"),"utf8"), /value = 3/);
});

test("compile-only skips application plugins and keeps the staging path stable for asset caches", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "core-compile-"));
    t.after(() => fs.rm(root, {recursive:true, force:true}));
    await fs.mkdir(path.join(root,"node_modules/.bin"), {recursive:true});
    await fs.symlink(require.resolve("typescript/bin/tsc"), path.join(root,"node_modules/.bin/tsc"));
    await fs.writeFile(path.join(root,"tsconfig.json"), JSON.stringify({compilerOptions:{types:[],allowJs:true,outDir:"build"}}));
    await fs.writeFile(path.join(root,"app.ts"), 'export const value = 42;');
    const config={build:{cacheDirectory:".webframez-cache",plugins:[{beforeBuild(){throw new Error("must not boot");}}]}};
    const first=new BuildApplication(root,config,{outDir:"build"}),second=new BuildApplication(root,config,{outDir:"build"});
    assert.equal(first.stagingDir,second.stagingDir);
    await fs.mkdir(path.join(root,"build"));await fs.writeFile(path.join(root,"build/stale.js"),"throw new Error('stale')");
    // Loading the compiler in the application process retains its AST beside
    // the runtime configuration and can exceed the bounded runner heap.
    const Module = require("node:module"), originalLoad = Module._load;
    const compiler = require.resolve("typescript");
    t.mock.method(Module, "_load", function(request, ...args) {
        if (request === compiler) throw new Error("Compiler must run in its own process");
        return originalLoad.call(this, request, ...args);
    });
    await first.compile();await second.compile();
    await assert.rejects(fs.access(path.join(root,"build/build")),{code:"ENOENT"});
    await assert.rejects(fs.access(path.join(root,"build/stale.js")),{code:"ENOENT"});
    assert.match(await fs.readFile(path.join(root,"build/app.js"),"utf8"),/42/);
    await fs.mkdir(first.stagingDir+".lock");
    await assert.rejects(first.compile(),/locked/);
});


test("compact builds retain source files when the project lives inside the cache root", async t => {
    const cache = await fs.mkdtemp(path.join(os.tmpdir(), "core-compact-"));
    t.after(() => fs.rm(cache, {recursive: true, force: true}));
    const root = path.join(cache, "nodejs", "application");
    await fs.mkdir(root, {recursive: true});
    await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({compilerOptions: {types: [], outDir: "dist"}}));
    await fs.writeFile(path.join(root, "app.ts"), "export const value = 42;");
    await new BuildApplication(root, {build: {cacheDirectory: cache}}, {outDir: "dist"}).compile();
    assert.match(await fs.readFile(path.join(root, "dist/app.js"), "utf8"), /42/);
});
