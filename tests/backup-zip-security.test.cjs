const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { extractBackupZip } = require("../dist/Backup/Utils/ZipReader");
const { createZipFile } = require("../dist/Backup/Utils/ZipWriter");
const { BackupManager } = require("../dist/Backup/BackupManager");

function fixture(t) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "backup-zip-security-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, "source");
    fs.writeFileSync(source, "restored content");
    const target = path.join(root, "restore");
    const archive = (names = ["nested/file.txt"], mutate) => {
        const zip = path.join(root, "backup.zip");
        createZipFile(zip, names.map(name => ({ source, name })));
        if (mutate) {
            const bytes = fs.readFileSync(zip);
            const central = bytes.readUInt32LE(bytes.length - 6);
            mutate(bytes, central);
            fs.writeFileSync(zip, bytes);
        }
        return zip;
    };
    return { root, source, target, archive };
}

test("backup restoration supports nested files and incremental overwrites", async t => {
    const f = fixture(t);
    const manager = new BackupManager();
    await manager.extractArtifact(f.archive(["nested/file.txt", ".webframez-backup/metadata.json"]), f.target);
    assert.equal(fs.readFileSync(path.join(f.target, "nested/file.txt"), "utf8"), "restored content");
    assert.equal(fs.existsSync(path.join(f.target, ".webframez-backup")), false);
    fs.writeFileSync(f.source, "new");
    await manager.extractArtifact(f.archive(), f.target);
    assert.equal(fs.readFileSync(path.join(f.target, "nested/file.txt"), "utf8"), "new");
});

test("stream files spanning multiple chunks without losing or overwriting bytes", async t => {
    const f = fixture(t);
    const content = require("node:crypto").randomBytes(2 * 1024 * 1024);
    fs.writeFileSync(f.source, content);
    await extractBackupZip(f.archive(), f.target);
    assert.deepEqual(fs.readFileSync(path.join(f.target, "nested/file.txt")), content);
});

for (const name of ["../escape.txt", "nested/../../escape.txt", "C:/escape.txt", "./file.txt", "nested//file.txt"]) {
    test(`reject unsafe ZIP name ${name}`, async t => {
        const f = fixture(t);
        await assert.rejects(extractBackupZip(f.archive([name]), f.target));
        assert.equal(fs.existsSync(path.join(f.root, "escape.txt")), false);
    });
}

test("reject absolute ZIP names", async t => {
    const f = fixture(t);
    const zip = f.archive(["afile"], (b, c) => { b[30] = 47; b[c + 46] = 47; });
    await assert.rejects(extractBackupZip(zip, f.target));
});

for (const mode of [0o120777, 0o010600, 0o020600]) {
    test(`reject ZIP symlink or special mode ${mode.toString(8)} before writing`, async t => {
        const f = fixture(t);
        fs.writeFileSync(f.source, "../../outside");
        const zip = f.archive(["link", "link/escape.txt"], (b, c) => b.writeUInt32LE((mode << 16) >>> 0, c + 38));
        await assert.rejects(extractBackupZip(zip, f.target), /symlinks and special files/);
        assert.equal(fs.existsSync(path.join(f.target, "link")), false);
    });
}

test("reject existing root and intermediate directory symlinks", async t => {
    const f = fixture(t);
    const outside = path.join(f.root, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, f.target, "dir");
    await assert.rejects(extractBackupZip(f.archive(), f.target), /symlink/);
    fs.unlinkSync(f.target);
    fs.mkdirSync(f.target);
    fs.symlinkSync(outside, path.join(f.target, "nested"), "dir");
    await assert.rejects(extractBackupZip(f.archive(), f.target), /symlink/);
    assert.deepEqual(fs.readdirSync(outside), []);
});

test("do not truncate destination symlinks or hardlinked files", async t => {
    const f = fixture(t);
    const outside = path.join(f.root, "outside.txt");
    fs.writeFileSync(outside, "keep");
    fs.mkdirSync(f.target);
    const file = path.join(f.target, "file.txt");
    for (const link of [() => fs.symlinkSync(outside, file), () => fs.linkSync(outside, file)]) {
        link();
        await assert.rejects(extractBackupZip(f.archive(["file.txt"]), f.target), /private regular file/);
        assert.equal(fs.readFileSync(outside, "utf8"), "keep");
        fs.unlinkSync(file);
    }
});

test("reject duplicate entries and inconsistent uncompressed sizes", async t => {
    const f = fixture(t);
    await assert.rejects(extractBackupZip(f.archive(["file.txt", "file.txt"]), f.target), /Duplicate/);
    const zip = f.archive(["file.txt"], (b, c) => b.writeUInt32LE(1, c + 24));
    await assert.rejects(extractBackupZip(zip, f.target), /size|bytes/i);
});

test("preserve executable bits but remove setuid and setgid", async t => {
    const f = fixture(t);
    const zip = f.archive(["run.sh"], (b, c) => b.writeUInt32LE((0o106755 << 16) >>> 0, c + 38));
    await extractBackupZip(zip, f.target);
    assert.equal(fs.statSync(path.join(f.target, "run.sh")).mode & 0o7777, 0o755);
});
