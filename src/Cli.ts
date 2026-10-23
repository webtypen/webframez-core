import fs from "node:fs";
import path from "node:path";
import { buildProductionDependencies } from "./BuildDependencies";
import { BuildApplication, WebframezAppConfig } from "./BuildApplication";

function printHelp() {
    console.log(
        [
            "webframez CLI",
            "",
            "Usage:",
            "  webframez run [command] [options]",
            "  webframez build [--dir=./build]",
            "",
            "Options:",
            "  --config=webframez.config.ts",
            "  --dir=./build-target-dir",
        ].join("\n"),
    );
}

function readOption(args: string[], name: string) {
    const prefix = `--${name}=`;
    for (let index = 0; index < args.length; index += 1) {
        const value = args[index];
        if (value === `--${name}`) {
            return args[index + 1] || null;
        }
        if (value.startsWith(prefix)) {
            return value.slice(prefix.length);
        }
    }

    return null;
}

function registerTsNode(projectRoot: string) {
    const tsNodeRegister = require.resolve("ts-node/register/transpile-only", {
        paths: [projectRoot, __dirname],
    });
    require(tsNodeRegister);
}

function loadConfig(projectRoot: string, args: string[]): WebframezAppConfig {
    const configuredPath = readOption(args, "config");
    const candidates = configuredPath
        ? [configuredPath]
        : ["webframez.config.ts", "webframez.config.js", "webframez.config.cjs"];

    for (const candidate of candidates) {
        const configPath = path.resolve(projectRoot, candidate);
        if (!fs.existsSync(configPath)) {
            continue;
        }

        if (configPath.endsWith(".ts")) {
            registerTsNode(projectRoot);
        }

        const imported = require(configPath);
        return imported.default || imported;
    }

    throw new Error("Missing webframez.config.ts");
}

async function runConsole(projectRoot: string, cliArgs: string[]) {
    const config = loadConfig(projectRoot, cliArgs);
    if (config.setup) {
        await config.setup({ mode: "console", projectRoot });
    }

    const { ConsoleApplication } = await import("./ConsoleApplication");
    const app = new ConsoleApplication();
    const originalArgv = process.argv;
    process.argv = [process.argv[0], "webframez", ...cliArgs];

    try {
        app.boot({
            kernel: config.consoleKernel || config.kernelConsole || config.kernel,
            config: config.config,
            jobs: config.jobs,
            modules: config.modules,
            datatables: config.datatables,
            errorHandler: config.errorHandler,
            onEnd: config.onEnd,
        });
    } finally {
        process.argv = originalArgv;
    }
}

async function runBuild(projectRoot: string, cliArgs: string[]) {
    const config = loadConfig(projectRoot, cliArgs);
    if (config.setup) {
        await config.setup({ mode: "build", projectRoot });
    }

    const outDir = readOption(cliArgs, "dir") || config.build?.dir || "build";
    const app = new BuildApplication(projectRoot, config, { outDir });
    await app.run();
}

export async function runWebframezCli(argv: string[] = process.argv.slice(2), projectRoot: string = process.cwd()) {
    const command = argv[0];

    if (!command || command === "--help" || command === "-h" || command === "help") {
        printHelp();
        return;
    }

    if (command === "run") {
        await runConsole(projectRoot, argv.slice(1));
        return;
    }

    if (command === "compile") {
        const tsconfig = readOption(argv, "project") || "tsconfig.json";
        const outDir = readOption(argv, "dir") || "build";
        const relative = path.relative(projectRoot, path.resolve(projectRoot, outDir));
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).some(part => [".git", "node_modules", ".webframez-cache"].includes(part))) throw new Error("Compile output must be a separate project directory.");
        await new BuildApplication(projectRoot, {build: {tsconfig, cacheDirectory: process.env.WEBFRAMEZ_BUILD_CACHE_DIRECTORY || ".webframez-cache"}}, {outDir}).compile();
        return;
    }

    if (command === "dependencies") {
        const outDir = readOption(argv, "dir");
        if (!outDir) throw new Error("Production dependencies require --dir.");
        await buildProductionDependencies(projectRoot, outDir, argv.includes("--ignore-scripts"));
        return;
    }

    if (command === "build" || command === "buid") {
        await runBuild(projectRoot, argv.slice(1));
        return;
    }

    throw new Error(`Unknown webframez command: ${command}`);
}
