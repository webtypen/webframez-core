import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export type WebframezBuildRuntimeFile =
    | string
    | {
          from: string;
          to?: string;
          optional?: boolean;
      };

export type WebframezBuildContext = {
    projectRoot: string;
    stagingDir: string;
    outDir: string;
    config: WebframezAppConfig;
    run: (binaryName: string, args: string[], envAdditions?: Record<string, string>) => Promise<number>;
};

export type WebframezBuildPlugin = {
    name?: string;
    beforeBuild?: (context: WebframezBuildContext) => Promise<void> | void;
    afterTypescriptBuild?: (context: WebframezBuildContext) => Promise<void> | void;
    afterRuntimeFilesCopied?: (context: WebframezBuildContext) => Promise<void> | void;
    buildAssets?: (context: WebframezBuildContext) => Promise<void> | void;
    validateBuild?: (context: WebframezBuildContext) => Promise<void> | void;
};

export type WebframezBuildConfig = {
    dir?: string;
    tsconfig?: string;
    entry?: string;
    runtimeFiles?: WebframezBuildRuntimeFile[];
    prunePaths?: string[];
    plugins?: Array<string | WebframezBuildPlugin | ((config: WebframezAppConfig) => WebframezBuildPlugin)>;
};

export type WebframezAppConfig = {
    setup?: (context: { mode: "web" | "console" | "build"; projectRoot: string }) => Promise<void> | void;
    kernel?: any;
    consoleKernel?: any;
    kernelConsole?: any;
    config?: Record<string, unknown>;
    jobs?: any[];
    modules?: any[];
    datatables?: any;
    errorHandler?: any;
    onEnd?: (...args: any[]) => Promise<void> | void;
    build?: WebframezBuildConfig;
};

type BuildApplicationOptions = {
    outDir: string;
};

function timestamp() {
    return new Date().toISOString().replace(/[-:TZ.]/g, "");
}

function normalizePackageWebframezPlugins(value: any): string[] {
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
        return value.plugins.filter((entry: unknown) => typeof entry === "string");
    }

    return [];
}

export class BuildApplication {
    private readonly projectRoot: string;
    private readonly config: WebframezAppConfig;
    private readonly outDir: string;
    private readonly buildRoot: string;
    private readonly stagingDir: string;
    private readonly buildId: string;

    constructor(projectRoot: string, config: WebframezAppConfig, options: BuildApplicationOptions) {
        this.projectRoot = projectRoot;
        this.config = config;
        this.outDir = path.resolve(projectRoot, options.outDir || config.build?.dir || "build");
        this.buildId = timestamp();
        this.buildRoot = path.resolve(projectRoot, ".webframez-build");
        this.stagingDir = path.join(this.buildRoot, `.building-${this.buildId}`);
    }

    async run() {
        const context = this.createContext();
        const plugins = this.loadPlugins();

        await fsp.rm(this.stagingDir, { recursive: true, force: true });
        await fsp.mkdir(this.stagingDir, { recursive: true });

        try {
            await this.callHook(plugins, "beforeBuild", context);
            await this.runTypescriptBuild(context);
            await this.callHook(plugins, "afterTypescriptBuild", context);
            await this.copyRuntimeFiles();
            await this.callHook(plugins, "afterRuntimeFilesCopied", context);
            await this.callHook(plugins, "buildAssets", context);
            await this.validateCoreBuild();
            await this.callHook(plugins, "validateBuild", context);
            await this.promoteBuild();

            console.log(`[webframez] Build ready: ${path.relative(this.projectRoot, this.outDir) || this.outDir}`);
        } catch (error) {
            await fsp.rm(this.stagingDir, { recursive: true, force: true });
            throw error;
        }
    }

    private createContext(): WebframezBuildContext {
        return {
            projectRoot: this.projectRoot,
            stagingDir: this.stagingDir,
            outDir: this.outDir,
            config: this.config,
            run: (binaryName, args, envAdditions) => this.runBinary(binaryName, args, envAdditions),
        };
    }

    private async callHook(
        plugins: WebframezBuildPlugin[],
        hookName: keyof WebframezBuildPlugin,
        context: WebframezBuildContext,
    ) {
        for (const plugin of plugins) {
            const hook = plugin[hookName];
            if (typeof hook !== "function") {
                continue;
            }

            console.log(`[webframez] ${plugin.name || "plugin"}:${String(hookName)}`);
            await hook(context);
        }
    }

    private runTypescriptBuild(context: WebframezBuildContext) {
        const tsconfig = path.resolve(this.projectRoot, this.config.build?.tsconfig || "tsconfig.json");
        return this.runOrFail(context, "tsc", ["-p", tsconfig, "--outDir", this.stagingDir]);
    }

    private async copyRuntimeFiles() {
        const runtimeFiles = this.config.build?.runtimeFiles || [
            { from: ".env", optional: true },
            { from: "storage", optional: true },
            "node_modules",
        ];

        for (const entry of runtimeFiles) {
            const from = typeof entry === "string" ? entry : entry.from;
            const to = typeof entry === "string" ? entry : entry.to || entry.from;
            const optional = typeof entry === "string" ? false : entry.optional === true;
            const sourcePath = path.resolve(this.projectRoot, from);
            const targetPath = path.resolve(this.stagingDir, to);

            if (!fs.existsSync(sourcePath)) {
                if (optional) {
                    continue;
                }
                throw new Error(`Runtime file does not exist: ${from}`);
            }

            await fsp.rm(targetPath, { recursive: true, force: true });
            await fsp.mkdir(path.dirname(targetPath), { recursive: true });
            await fsp.cp(sourcePath, targetPath, {
                recursive: true,
                dereference: false,
            });
        }

        for (const prunePath of this.config.build?.prunePaths || []) {
            await fsp.rm(path.resolve(this.stagingDir, prunePath), { recursive: true, force: true });
        }
    }

    private async validateCoreBuild() {
        const entry = this.config.build?.entry || "app.js";
        const entryPath = path.resolve(this.stagingDir, entry);
        if (!fs.existsSync(entryPath)) {
            throw new Error(`Build entry missing: ${entry}`);
        }
    }

    private async promoteBuild() {
        const previousDir = path.join(this.buildRoot, `.previous-${this.buildId}`);
        await fsp.mkdir(path.dirname(this.outDir), { recursive: true });
        await fsp.rm(previousDir, { recursive: true, force: true });

        let movedPrevious = false;
        try {
            if (fs.existsSync(this.outDir)) {
                await fsp.rename(this.outDir, previousDir);
                movedPrevious = true;
            }

            await fsp.rename(this.stagingDir, this.outDir);
            await fsp.rm(previousDir, { recursive: true, force: true });
        } catch (error) {
            if (movedPrevious && !fs.existsSync(this.outDir) && fs.existsSync(previousDir)) {
                await fsp.rename(previousDir, this.outDir);
            }
            throw error;
        }
    }

    private loadPlugins(): WebframezBuildPlugin[] {
        const plugins: WebframezBuildPlugin[] = [];

        for (const pluginInput of this.config.build?.plugins || []) {
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

    private discoverPackagePlugins() {
        const packageJsonPath = path.resolve(this.projectRoot, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            return [];
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const dependencyNames = new Set<string>([
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {}),
            ...Object.keys(packageJson.peerDependencies || {}),
        ]);
        const discovered: Array<{ spec: string; packageRoot: string }> = [];

        for (const dependencyName of dependencyNames) {
            const dependencyPackageJsonPath = path.resolve(this.projectRoot, "node_modules", dependencyName, "package.json");
            if (!fs.existsSync(dependencyPackageJsonPath)) {
                continue;
            }

            const dependencyPackageJson = JSON.parse(fs.readFileSync(dependencyPackageJsonPath, "utf-8"));
            for (const plugin of normalizePackageWebframezPlugins(dependencyPackageJson.webframez)) {
                discovered.push({
                    spec: plugin,
                    packageRoot: path.dirname(dependencyPackageJsonPath),
                });
            }
        }

        return discovered;
    }

    private resolvePlugin(
        pluginInput: string | WebframezBuildPlugin | ((config: WebframezAppConfig) => WebframezBuildPlugin),
        baseDir: string,
    ): WebframezBuildPlugin | null {
        let pluginModule: any = pluginInput;

        if (typeof pluginInput === "string") {
            const pluginPath = pluginInput.startsWith(".")
                ? path.resolve(baseDir, pluginInput)
                : require.resolve(pluginInput, { paths: [this.projectRoot, baseDir] });
            pluginModule = require(pluginPath);
        }

        const pluginFactoryOrObject = pluginModule.default || pluginModule.createPlugin || pluginModule;
        const plugin = typeof pluginFactoryOrObject === "function" ? pluginFactoryOrObject(this.config) : pluginFactoryOrObject;
        return plugin || null;
    }

    private async runOrFail(context: WebframezBuildContext, binaryName: string, args: string[]) {
        const code = await context.run(binaryName, args);
        if (code !== 0) {
            throw new Error(`${binaryName} exited with code ${code}`);
        }
    }

    private runBinary(binaryName: string, args: string[], envAdditions: Record<string, string> = {}) {
        const binaryPath = this.resolveBinary(binaryName);

        return new Promise<number>((resolve, reject) => {
            const child = spawn(binaryPath, args, {
                cwd: this.projectRoot,
                stdio: "inherit",
                shell: false,
                env: {
                    ...process.env,
                    ...envAdditions,
                },
            });

            child.on("error", reject);
            child.on("close", (code) => resolve(code || 0));
        });
    }

    private resolveBinary(name: string) {
        const extension = process.platform === "win32" ? ".cmd" : "";
        const localBinary = path.resolve(this.projectRoot, "node_modules", ".bin", `${name}${extension}`);
        if (fs.existsSync(localBinary)) {
            return localBinary;
        }

        return name;
    }
}
