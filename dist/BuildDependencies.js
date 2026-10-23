"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProductionDependencies = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
/** Prepare an independent production install without pruning the development tree. */
function buildProductionDependencies(projectRoot, outDir, ignoreScripts = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifest = JSON.parse(yield promises_1.default.readFile(node_path_1.default.join(projectRoot, "package.json"), "utf8"));
        if (!/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\.[a-f0-9]+)?$/.test(manifest.packageManager || "")) {
            throw new Error("Production dependencies require a pinned pnpm packageManager.");
        }
        if (manifest.workspaces || Object.values(Object.assign(Object.assign(Object.assign({}, manifest.dependencies), manifest.devDependencies), manifest.optionalDependencies)).some(value => /^(file:|link:|workspace:|\.\.?\/)/.test(String(value)))) {
            throw new Error("Workspace/local dependencies require pnpm deploy instead.");
        }
        const output = node_path_1.default.resolve(projectRoot, outDir);
        const relative = node_path_1.default.relative(projectRoot, output);
        if (!relative || relative.startsWith("..") || node_path_1.default.isAbsolute(relative) || relative.split(node_path_1.default.sep).some(part => [".git", "node_modules", ".webframez-cache"].includes(part))) {
            throw new Error("Production output must be a separate directory inside the project.");
        }
        const metadata = { "package.json": JSON.stringify(Object.assign(Object.assign({}, manifest), { scripts: undefined })) };
        metadata["pnpm-lock.yaml"] = yield promises_1.default.readFile(node_path_1.default.join(projectRoot, "pnpm-lock.yaml"), "utf8");
        for (const name of ["pnpm-workspace.yaml"]) {
            const content = yield promises_1.default.readFile(node_path_1.default.join(projectRoot, name), "utf8").catch(() => "");
            if (content)
                metadata[name] = content;
        }
        if (/^\s*packages\s*:/m.test(metadata["pnpm-workspace.yaml"] || "") || /(?:^|[\s\x22\x27@])(?:file|link|workspace):/m.test(metadata["pnpm-lock.yaml"])) {
            throw new Error("Workspace/local dependencies require pnpm deploy instead.");
        }
        const userconfig = process.env.NPM_CONFIG_USERCONFIG || process.env.npm_config_userconfig || node_path_1.default.join(projectRoot, ".npmrc");
        const registry = yield promises_1.default.readFile(userconfig, "utf8").catch(() => "");
        const scope = node_crypto_1.default.createHash("sha256").update(projectRoot).digest("hex").slice(0, 24);
        const cache = node_path_1.default.join(node_path_1.default.resolve(projectRoot, process.env.WEBFRAMEZ_BUILD_CACHE_DIRECTORY || ".webframez-cache"), "production", scope);
        const key = node_crypto_1.default.createHash("sha256").update(JSON.stringify([metadata, registry, ignoreScripts, process.version, process.platform, process.arch])).digest("hex");
        const previous = yield promises_1.default.readFile(node_path_1.default.join(cache, "fingerprint"), "utf8").catch(() => "");
        if (previous !== key)
            yield promises_1.default.rm(cache, { recursive: true, force: true });
        yield promises_1.default.mkdir(cache, { recursive: true });
        for (const [name, content] of Object.entries(metadata))
            yield promises_1.default.writeFile(node_path_1.default.join(cache, name), content);
        const started = Date.now();
        console.log(`[webframez] production dependencies: ${previous === key ? "reuse" : "cold"}`);
        try {
            const expected = manifest.packageManager.split("@")[1].split("+")[0];
            const { stdout } = yield (0, node_util_1.promisify)(node_child_process_1.execFile)("pnpm", ["--version"], { cwd: projectRoot });
            if (stdout.trim() !== expected)
                throw new Error(`Expected pnpm ${expected}, got ${stdout.trim()}`);
            yield new Promise((resolve, reject) => {
                const child = (0, node_child_process_1.spawn)("pnpm", ["install", "--frozen-lockfile", "--prod", ...(ignoreScripts ? ["--ignore-scripts"] : [])], {
                    cwd: cache, stdio: "inherit", env: Object.assign(Object.assign({}, process.env), { NODE_ENV: "production", NPM_CONFIG_USERCONFIG: userconfig }),
                });
                child.once("error", reject);
                child.once("exit", code => code === 0 ? resolve() : reject(new Error(`pnpm production install exited with code ${code}`)));
            });
            const modules = node_path_1.default.join(cache, "node_modules"), destination = node_path_1.default.join(output, "node_modules");
            yield promises_1.default.mkdir(output, { recursive: true });
            yield promises_1.default.rm(destination, { recursive: true, force: true });
            if (yield promises_1.default.stat(modules).catch(() => null)) {
                if (process.platform === "linux")
                    yield (0, node_util_1.promisify)(node_child_process_1.execFile)("cp", ["-a", "--reflink=auto", "--", modules, destination]);
                else
                    yield promises_1.default.cp(modules, destination, { recursive: true });
            }
            yield promises_1.default.writeFile(node_path_1.default.join(cache, "fingerprint"), key);
            console.log(`[webframez] production dependencies: ready (${((Date.now() - started) / 1000).toFixed(2)}s)`);
        }
        catch (error) {
            yield promises_1.default.rm(cache, { recursive: true, force: true });
            throw error;
        }
    });
}
exports.buildProductionDependencies = buildProductionDependencies;
