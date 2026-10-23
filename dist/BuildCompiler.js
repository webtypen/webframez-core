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
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
/** A separate process releases the compiler AST before runtime copies and bundling. */
function compile({ projectRoot, tsconfig, outDir, buildRoot, root, stagingDir }) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const ts = require(require.resolve("typescript", { paths: [projectRoot, __dirname] }));
        const scope = node_crypto_1.default.createHash("sha256").update(tsconfig).digest("hex").slice(0, 24);
        const cache = node_path_1.default.join(root, "typescript", scope), output = node_path_1.default.join(cache, "output");
        const loaded = ts.readConfigFile(tsconfig, ts.sys.readFile);
        const parsed = ts.parseJsonConfigFileContent(loaded.config || {}, ts.sys, node_path_1.default.dirname(tsconfig), undefined, tsconfig);
        if (parsed.options.noEmit)
            throw new Error("Build compilation requires emitted output; remove noEmit from the build configuration.");
        // Resolve the original project before redirecting output. Otherwise allowJs
        // projects accidentally compile their previous build into build/build/.
        const inside = (parent, file) => file === parent || file.startsWith(parent + node_path_1.default.sep);
        // Compact runners may place the source checkout inside the shared cache root.
        const generated = [outDir, buildRoot, inside(root, projectRoot) ? cache : root, parsed.options.outDir].filter(Boolean);
        const files = parsed.fileNames.filter((file) => !generated.some(directory => inside(directory, file)));
        const key = node_crypto_1.default.createHash("sha256").update(JSON.stringify(["bounded-generated-imports-v1", files, parsed.options, ts.version])).digest("hex");
        const previous = yield promises_1.default.readFile(node_path_1.default.join(cache, "key"), "utf8").catch(() => "");
        if (previous !== key)
            yield promises_1.default.rm(cache, { recursive: true, force: true });
        yield promises_1.default.mkdir(output, { recursive: true });
        console.log(`[webframez] TypeScript cache: ${previous === key ? "reuse" : "cold"} (${files.length} source files)`);
        try {
            const options = Object.assign(Object.assign({}, parsed.options), { outDir: output, incremental: true, tsBuildInfoFile: node_path_1.default.join(cache, "build.tsbuildinfo") });
            const host = ts.createIncrementalCompilerHost(options);
            // JavaScript scripts may require the previous build for smoke checks.
            // Do not let those imports pull generated code and a second dependency
            // tree back into compilation. The last good output remains untouched.
            const hidden = (file) => file !== options.tsBuildInfoFile && generated.some(directory => inside(directory, node_path_1.default.resolve(file)));
            for (const name of ["fileExists", "directoryExists", "readFile"]) {
                const original = (_a = host[name]) === null || _a === void 0 ? void 0 : _a.bind(host);
                if (original)
                    host[name] = (file) => hidden(file) ? (name === "readFile" ? undefined : false) : original(file);
            }
            const builder = ts.createIncrementalProgram({ rootNames: files, options, host, projectReferences: parsed.projectReferences });
            const diagnostics = [...(loaded.error ? [loaded.error] : []), ...parsed.errors, ...builder.getOptionsDiagnostics(), ...builder.getGlobalDiagnostics(), ...builder.getSyntacticDiagnostics(), ...builder.getSemanticDiagnostics()];
            if (diagnostics.length)
                console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => projectRoot, getNewLine: () => "\n" }));
            if (diagnostics.some((entry) => entry.category === ts.DiagnosticCategory.Error))
                throw new Error("tsc exited with code 1");
            const emitted = builder.emit();
            if ((_b = emitted.diagnostics) === null || _b === void 0 ? void 0 : _b.length) {
                console.error(ts.formatDiagnosticsWithColorAndContext(emitted.diagnostics, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => projectRoot, getNewLine: () => "\n" }));
                if (emitted.diagnostics.some((entry) => entry.category === ts.DiagnosticCategory.Error))
                    throw new Error("tsc exited with code 1");
            }
            if (emitted.emitSkipped)
                throw new Error("tsc exited without emitting output");
            yield promises_1.default.cp(output, stagingDir, { recursive: true, mode: node_fs_1.default.constants.COPYFILE_FICLONE });
            yield promises_1.default.writeFile(node_path_1.default.join(cache, "key"), key);
        }
        catch (error) {
            yield promises_1.default.rm(cache, { recursive: true, force: true });
            throw error;
        }
    });
}
if (require.main === module) {
    compile(JSON.parse(process.argv[2])).catch(error => {
        console.error((error === null || error === void 0 ? void 0 : error.stack) || error);
        process.exitCode = 1;
    });
}
