import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

/** Prepare an independent production install without pruning the development tree. */
export async function buildProductionDependencies(projectRoot: string, outDir: string, ignoreScripts = false) {
    const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"));
    if (!/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\.[a-f0-9]+)?$/.test(manifest.packageManager || "")) {
        throw new Error("Production dependencies require a pinned pnpm packageManager.");
    }
    if (manifest.workspaces || Object.values({...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies}).some(value => /^(file:|link:|workspace:|\.\.?\/)/.test(String(value)))) {
        throw new Error("Workspace/local dependencies require pnpm deploy instead.");
    }
    const output = path.resolve(projectRoot, outDir);
    const relative = path.relative(projectRoot, output);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).some(part => [".git", "node_modules", ".webframez-cache"].includes(part))) {
        throw new Error("Production output must be a separate directory inside the project.");
    }
    const metadata: Record<string, string> = {"package.json": JSON.stringify({...manifest, scripts: undefined})};
    metadata["pnpm-lock.yaml"] = await fs.readFile(path.join(projectRoot, "pnpm-lock.yaml"), "utf8");
    for (const name of ["pnpm-workspace.yaml"]) {
        const content = await fs.readFile(path.join(projectRoot, name), "utf8").catch(() => "");
        if (content) metadata[name] = content;
    }
    if (/^\s*packages\s*:/m.test(metadata["pnpm-workspace.yaml"] || "") || /(?:^|[\s\x22\x27@])(?:file|link|workspace):/m.test(metadata["pnpm-lock.yaml"])) {
        throw new Error("Workspace/local dependencies require pnpm deploy instead.");
    }
    const userconfig = process.env.NPM_CONFIG_USERCONFIG || process.env.npm_config_userconfig || path.join(projectRoot, ".npmrc");
    const registry = await fs.readFile(userconfig, "utf8").catch(() => "");
    const scope = crypto.createHash("sha256").update(projectRoot).digest("hex").slice(0, 24);
    const cache = path.join(path.resolve(projectRoot, process.env.WEBFRAMEZ_BUILD_CACHE_DIRECTORY || ".webframez-cache"), "production", scope);
    const key = crypto.createHash("sha256").update(JSON.stringify([metadata, registry, ignoreScripts, process.version, process.platform, process.arch])).digest("hex");
    const previous = await fs.readFile(path.join(cache, "fingerprint"), "utf8").catch(() => "");
    if (previous !== key) await fs.rm(cache, {recursive: true, force: true});
    await fs.mkdir(cache, {recursive: true});
    for (const [name, content] of Object.entries(metadata)) await fs.writeFile(path.join(cache, name), content);
    const started = Date.now();
    console.log(`[webframez] production dependencies: ${previous === key ? "reuse" : "cold"}`);
    try {
        const expected = manifest.packageManager.split("@")[1].split("+")[0];
        const {stdout} = await promisify(execFile)("pnpm", ["--version"], {cwd: projectRoot});
        if (stdout.trim() !== expected) throw new Error(`Expected pnpm ${expected}, got ${stdout.trim()}`);
        await new Promise<void>((resolve, reject) => {
            const child = spawn("pnpm", ["install", "--frozen-lockfile", "--prod", ...(ignoreScripts ? ["--ignore-scripts"] : [])], {
                cwd: cache, stdio: "inherit", env: {...process.env, NODE_ENV: "production", NPM_CONFIG_USERCONFIG: userconfig},
            });
            child.once("error", reject);
            child.once("exit", code => code === 0 ? resolve() : reject(new Error(`pnpm production install exited with code ${code}`)));
        });
        const modules = path.join(cache, "node_modules"), destination = path.join(output, "node_modules");
        await fs.mkdir(output, {recursive: true});
        await fs.rm(destination, {recursive: true, force: true});
        if (await fs.stat(modules).catch(() => null)) {
            if (process.platform === "linux") await promisify(execFile)("cp", ["-a", "--reflink=auto", "--", modules, destination]);
            else await fs.cp(modules, destination, {recursive: true});
        }
        await fs.writeFile(path.join(cache, "fingerprint"), key);
        console.log(`[webframez] production dependencies: ready (${((Date.now() - started) / 1000).toFixed(2)}s)`);
    } catch (error) {
        await fs.rm(cache, {recursive: true, force: true});
        throw error;
    }
}
