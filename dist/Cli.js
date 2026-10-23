"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.runWebframezCli = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const BuildDependencies_1 = require("./BuildDependencies");
const BuildApplication_1 = require("./BuildApplication");
function printHelp() {
    console.log([
        "webframez CLI",
        "",
        "Usage:",
        "  webframez run [command] [options]",
        "  webframez build [--dir=./build]",
        "",
        "Options:",
        "  --config=webframez.config.ts",
        "  --dir=./build-target-dir",
    ].join("\n"));
}
function readOption(args, name) {
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
function registerTsNode(projectRoot) {
    const tsNodeRegister = require.resolve("ts-node/register/transpile-only", {
        paths: [projectRoot, __dirname],
    });
    require(tsNodeRegister);
}
function loadConfig(projectRoot, args) {
    const configuredPath = readOption(args, "config");
    const candidates = configuredPath
        ? [configuredPath]
        : ["webframez.config.ts", "webframez.config.js", "webframez.config.cjs"];
    for (const candidate of candidates) {
        const configPath = node_path_1.default.resolve(projectRoot, candidate);
        if (!node_fs_1.default.existsSync(configPath)) {
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
function runConsole(projectRoot, cliArgs) {
    return __awaiter(this, void 0, void 0, function* () {
        const config = loadConfig(projectRoot, cliArgs);
        if (config.setup) {
            yield config.setup({ mode: "console", projectRoot });
        }
        const { ConsoleApplication } = yield Promise.resolve().then(() => __importStar(require("./ConsoleApplication")));
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
        }
        finally {
            process.argv = originalArgv;
        }
    });
}
function runBuild(projectRoot, cliArgs) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const config = loadConfig(projectRoot, cliArgs);
        if (config.setup) {
            yield config.setup({ mode: "build", projectRoot });
        }
        const outDir = readOption(cliArgs, "dir") || ((_a = config.build) === null || _a === void 0 ? void 0 : _a.dir) || "build";
        const app = new BuildApplication_1.BuildApplication(projectRoot, config, { outDir });
        yield app.run();
    });
}
function runWebframezCli(argv = process.argv.slice(2), projectRoot = process.cwd()) {
    return __awaiter(this, void 0, void 0, function* () {
        const command = argv[0];
        if (!command || command === "--help" || command === "-h" || command === "help") {
            printHelp();
            return;
        }
        if (command === "run") {
            yield runConsole(projectRoot, argv.slice(1));
            return;
        }
        if (command === "compile") {
            const tsconfig = readOption(argv, "project") || "tsconfig.json";
            const outDir = readOption(argv, "dir") || "build";
            const relative = node_path_1.default.relative(projectRoot, node_path_1.default.resolve(projectRoot, outDir));
            if (!relative || relative.startsWith("..") || node_path_1.default.isAbsolute(relative) || relative.split(node_path_1.default.sep).some(part => [".git", "node_modules", ".webframez-cache"].includes(part)))
                throw new Error("Compile output must be a separate project directory.");
            yield new BuildApplication_1.BuildApplication(projectRoot, { build: { tsconfig, cacheDirectory: process.env.WEBFRAMEZ_BUILD_CACHE_DIRECTORY || ".webframez-cache" } }, { outDir }).compile();
            return;
        }
        if (command === "dependencies") {
            const outDir = readOption(argv, "dir");
            if (!outDir)
                throw new Error("Production dependencies require --dir.");
            yield (0, BuildDependencies_1.buildProductionDependencies)(projectRoot, outDir, argv.includes("--ignore-scripts"));
            return;
        }
        if (command === "build" || command === "buid") {
            yield runBuild(projectRoot, argv.slice(1));
            return;
        }
        throw new Error(`Unknown webframez command: ${command}`);
    });
}
exports.runWebframezCli = runWebframezCli;
