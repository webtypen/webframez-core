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
exports.BuildApplication = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
function timestamp() {
    return new Date().toISOString().replace(/[-:TZ.]/g, "");
}
function logTimestamp() {
    return new Date().toISOString();
}
function normalizePackageWebframezPlugins(value) {
    if (!value) {
        return [];
    }
    if (typeof value === "string") {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === "string");
    }
    if (typeof value.plugin === "string") {
        return [value.plugin];
    }
    if (Array.isArray(value.plugins)) {
        return value.plugins.filter((entry) => typeof entry === "string");
    }
    return [];
}
class BuildApplication {
    constructor(projectRoot, config, options) {
        var _a;
        this.projectRoot = projectRoot;
        this.config = config;
        this.outDir = node_path_1.default.resolve(projectRoot, options.outDir || ((_a = config.build) === null || _a === void 0 ? void 0 : _a.dir) || "build");
        this.buildId = timestamp();
        this.buildRoot = node_path_1.default.resolve(projectRoot, ".webframez-build");
        this.stagingDir = node_path_1.default.join(this.buildRoot, `.building-${this.buildId}`);
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const context = this.createContext();
            const plugins = this.loadPlugins();
            const startedAt = Date.now();
            this.logBuildStep("start", `outDir=${this.outDir}`);
            yield promises_1.default.rm(this.stagingDir, { recursive: true, force: true });
            yield promises_1.default.mkdir(this.stagingDir, { recursive: true });
            try {
                yield this.callHook(plugins, "beforeBuild", context);
                yield this.runStep("typescript", () => this.runTypescriptBuild(context));
                yield this.callHook(plugins, "afterTypescriptBuild", context);
                yield this.runStep("runtime files", () => this.copyRuntimeFiles());
                yield this.callHook(plugins, "afterRuntimeFilesCopied", context);
                yield this.callHook(plugins, "buildAssets", context);
                yield this.runStep("core validation", () => this.validateCoreBuild());
                yield this.callHook(plugins, "validateBuild", context);
                yield this.runStep("promote", () => this.promoteBuild());
                console.log(`[webframez] Build ready: ${node_path_1.default.relative(this.projectRoot, this.outDir) || this.outDir} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
            }
            catch (error) {
                yield promises_1.default.rm(this.stagingDir, { recursive: true, force: true });
                throw error;
            }
        });
    }
    logBuildStep(label, details = "") {
        console.log(`[webframez] [${logTimestamp()}] ${label}${details ? `: ${details}` : ""}`);
    }
    runStep(label, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            const startedAt = Date.now();
            this.logBuildStep(`${label}:start`);
            try {
                const result = yield callback();
                this.logBuildStep(`${label}:done`, `${Math.round((Date.now() - startedAt) / 1000)}s`);
                return result;
            }
            catch (error) {
                this.logBuildStep(`${label}:failed`, `${Math.round((Date.now() - startedAt) / 1000)}s`);
                throw error;
            }
        });
    }
    createContext() {
        return {
            projectRoot: this.projectRoot,
            stagingDir: this.stagingDir,
            outDir: this.outDir,
            config: this.config,
            run: (binaryName, args, envAdditions) => this.runBinary(binaryName, args, envAdditions),
        };
    }
    callHook(plugins, hookName, context) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const plugin of plugins) {
                const hook = plugin[hookName];
                if (typeof hook !== "function") {
                    continue;
                }
                console.log(`[webframez] ${plugin.name || "plugin"}:${String(hookName)}`);
                yield hook(context);
            }
        });
    }
    runTypescriptBuild(context) {
        var _a;
        const tsconfig = node_path_1.default.resolve(this.projectRoot, ((_a = this.config.build) === null || _a === void 0 ? void 0 : _a.tsconfig) || "tsconfig.json");
        return this.runOrFail(context, "tsc", ["-p", tsconfig, "--outDir", this.stagingDir]);
    }
    copyRuntimeFiles() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const runtimeFiles = ((_a = this.config.build) === null || _a === void 0 ? void 0 : _a.runtimeFiles) || [
                { from: ".env", optional: true },
                { from: "storage", optional: true },
                "node_modules",
            ];
            for (const entry of runtimeFiles) {
                const from = typeof entry === "string" ? entry : entry.from;
                const to = typeof entry === "string" ? entry : entry.to || entry.from;
                const optional = typeof entry === "string" ? false : entry.optional === true;
                const sourcePath = node_path_1.default.resolve(this.projectRoot, from);
                const targetPath = node_path_1.default.resolve(this.stagingDir, to);
                if (!node_fs_1.default.existsSync(sourcePath)) {
                    if (optional) {
                        continue;
                    }
                    throw new Error(`Runtime file does not exist: ${from}`);
                }
                yield promises_1.default.rm(targetPath, { recursive: true, force: true });
                yield promises_1.default.mkdir(node_path_1.default.dirname(targetPath), { recursive: true });
                yield promises_1.default.cp(sourcePath, targetPath, {
                    recursive: true,
                    dereference: false,
                });
            }
            for (const prunePath of ((_b = this.config.build) === null || _b === void 0 ? void 0 : _b.prunePaths) || []) {
                yield promises_1.default.rm(node_path_1.default.resolve(this.stagingDir, prunePath), { recursive: true, force: true });
            }
        });
    }
    validateCoreBuild() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const entry = ((_a = this.config.build) === null || _a === void 0 ? void 0 : _a.entry) || "app.js";
            const entryPath = node_path_1.default.resolve(this.stagingDir, entry);
            if (!node_fs_1.default.existsSync(entryPath)) {
                throw new Error(`Build entry missing: ${entry}`);
            }
        });
    }
    promoteBuild() {
        return __awaiter(this, void 0, void 0, function* () {
            const previousDir = node_path_1.default.join(this.buildRoot, `.previous-${this.buildId}`);
            yield promises_1.default.mkdir(node_path_1.default.dirname(this.outDir), { recursive: true });
            yield promises_1.default.rm(previousDir, { recursive: true, force: true });
            let movedPrevious = false;
            try {
                if (node_fs_1.default.existsSync(this.outDir)) {
                    yield promises_1.default.rename(this.outDir, previousDir);
                    movedPrevious = true;
                }
                yield promises_1.default.rename(this.stagingDir, this.outDir);
                yield promises_1.default.rm(previousDir, { recursive: true, force: true });
            }
            catch (error) {
                if (movedPrevious && !node_fs_1.default.existsSync(this.outDir) && node_fs_1.default.existsSync(previousDir)) {
                    yield promises_1.default.rename(previousDir, this.outDir);
                }
                throw error;
            }
        });
    }
    loadPlugins() {
        var _a;
        const plugins = [];
        for (const pluginInput of ((_a = this.config.build) === null || _a === void 0 ? void 0 : _a.plugins) || []) {
            const plugin = this.resolvePlugin(pluginInput, this.projectRoot);
            if (plugin) {
                plugins.push(plugin);
            }
        }
        for (const pluginSpec of this.discoverPackagePlugins()) {
            const plugin = this.resolvePlugin(pluginSpec.spec, pluginSpec.packageRoot);
            if (plugin) {
                plugins.push(plugin);
            }
        }
        return plugins;
    }
    discoverPackagePlugins() {
        const packageJsonPath = node_path_1.default.resolve(this.projectRoot, "package.json");
        if (!node_fs_1.default.existsSync(packageJsonPath)) {
            return [];
        }
        const packageJson = JSON.parse(node_fs_1.default.readFileSync(packageJsonPath, "utf-8"));
        const dependencyNames = new Set([
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {}),
            ...Object.keys(packageJson.peerDependencies || {}),
        ]);
        const discovered = [];
        for (const dependencyName of dependencyNames) {
            const dependencyPackageJsonPath = node_path_1.default.resolve(this.projectRoot, "node_modules", dependencyName, "package.json");
            if (!node_fs_1.default.existsSync(dependencyPackageJsonPath)) {
                continue;
            }
            const dependencyPackageJson = JSON.parse(node_fs_1.default.readFileSync(dependencyPackageJsonPath, "utf-8"));
            for (const plugin of normalizePackageWebframezPlugins(dependencyPackageJson.webframez)) {
                discovered.push({
                    spec: plugin,
                    packageRoot: node_path_1.default.dirname(dependencyPackageJsonPath),
                });
            }
        }
        return discovered;
    }
    resolvePlugin(pluginInput, baseDir) {
        let pluginModule = pluginInput;
        if (typeof pluginInput === "string") {
            const pluginPath = pluginInput.startsWith(".")
                ? node_path_1.default.resolve(baseDir, pluginInput)
                : require.resolve(pluginInput, { paths: [this.projectRoot, baseDir] });
            pluginModule = require(pluginPath);
        }
        const pluginFactoryOrObject = pluginModule.default || pluginModule.createPlugin || pluginModule;
        const plugin = typeof pluginFactoryOrObject === "function" ? pluginFactoryOrObject(this.config) : pluginFactoryOrObject;
        return plugin || null;
    }
    runOrFail(context, binaryName, args) {
        return __awaiter(this, void 0, void 0, function* () {
            const code = yield context.run(binaryName, args);
            if (code !== 0) {
                throw new Error(`${binaryName} exited with code ${code}`);
            }
        });
    }
    runBinary(binaryName, args, envAdditions = {}) {
        const binaryPath = this.resolveBinary(binaryName);
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(binaryPath, args, {
                cwd: this.projectRoot,
                stdio: "inherit",
                shell: false,
                env: Object.assign(Object.assign({}, process.env), envAdditions),
            });
            child.on("error", reject);
            child.on("close", (code, signal) => {
                if (signal) {
                    reject(new Error(`${binaryName} exited with signal ${signal}`));
                    return;
                }
                resolve(code !== null && code !== void 0 ? code : 0);
            });
        });
    }
    resolveBinary(name) {
        const extension = process.platform === "win32" ? ".cmd" : "";
        const localBinary = node_path_1.default.resolve(this.projectRoot, "node_modules", ".bin", `${name}${extension}`);
        if (node_fs_1.default.existsSync(localBinary)) {
            return localBinary;
        }
        return name;
    }
}
exports.BuildApplication = BuildApplication;
