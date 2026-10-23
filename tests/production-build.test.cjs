const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {buildProductionDependencies} = require('../dist/BuildDependencies');

test('production dependencies are isolated, cached, invalidated and never prune source dependencies', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'core-production-'));
    const before = {...process.env};
    t.after(async () => {process.env = before; await fs.rm(root, {recursive:true, force:true});});
    const bin = path.join(root, 'bin'); await fs.mkdir(bin);
    await fs.writeFile(path.join(bin, 'pnpm'), `#!${process.execPath}
const fs=require('fs'),assert=require('assert/strict');
if(process.argv.includes('--version')){console.log('10.34.5');process.exit(0);}
assert.ok(process.argv.includes('--frozen-lockfile'));assert.ok(process.argv.includes('--prod'));
assert.equal(JSON.parse(fs.readFileSync('package.json')).scripts,undefined);
if(process.env.FAIL_INSTALL)process.exit(7);
fs.mkdirSync('node_modules/runtime',{recursive:true});fs.writeFileSync('node_modules/runtime/index.js','module.exports=42');
`, {mode:0o755});
    process.env.PATH=bin+path.delimiter+before.PATH;
    process.env.WEBFRAMEZ_BUILD_CACHE_DIRECTORY=path.join(root,'.webframez-cache');
    const manifest={name:'fixture',version:'1.0.0',packageManager:'pnpm@10.34.5',scripts:{postinstall:'throw-sensitive-root-hook'},devDependencies:{dev:'1.0.0'}};
    await fs.writeFile(path.join(root,'package.json'),JSON.stringify(manifest));
    await fs.writeFile(path.join(root,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\npackages:\n  get-caller-file: 2.0.5\n");
    await fs.mkdir(path.join(root,'node_modules/dev'),{recursive:true});
    await fs.writeFile(path.join(root,'node_modules/dev/keep'),'development');
    await buildProductionDependencies(root,'build');
    const caches=path.join(root,'.webframez-cache/production');
    const cache=path.join(caches,(await fs.readdir(caches))[0]);
    await fs.writeFile(path.join(cache,'node_modules/runtime/retained'),'warm');
    await buildProductionDependencies(root,'build');
    assert.equal(await fs.readFile(path.join(root,'build/node_modules/runtime/retained'),'utf8'),'warm');
    await assert.rejects(fs.access(path.join(root,'build/node_modules/dev')),{code:'ENOENT'});
    assert.equal(await fs.readFile(path.join(root,'node_modules/dev/keep'),'utf8'),'development');
    manifest.version='1.0.1';await fs.writeFile(path.join(root,'package.json'),JSON.stringify(manifest));
    await buildProductionDependencies(root,'build');
    await assert.rejects(fs.access(path.join(root,'build/node_modules/runtime/retained')),{code:'ENOENT'});
    process.env.FAIL_INSTALL='1';await assert.rejects(buildProductionDependencies(root,'build'),/code 7/);
    await assert.rejects(fs.access(cache),{code:'ENOENT'});
    assert.equal(await fs.readFile(path.join(root,'build/node_modules/runtime/index.js'),'utf8'),'module.exports=42');
    for(const directory of ['.','node_modules','../outside'])await assert.rejects(buildProductionDependencies(root,directory),/separate directory/);
});
