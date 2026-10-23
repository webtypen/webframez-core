import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/** A separate process releases the compiler AST before runtime copies and bundling. */
async function compile({projectRoot, tsconfig, outDir, buildRoot, root, stagingDir}: Record<string, string>) {
    const ts = require(require.resolve("typescript", {paths: [projectRoot, __dirname]}));
    const scope = crypto.createHash("sha256").update(tsconfig).digest("hex").slice(0, 24);
    const cache = path.join(root, "typescript", scope), output = path.join(cache, "output");
    const loaded = ts.readConfigFile(tsconfig, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(loaded.config || {}, ts.sys, path.dirname(tsconfig), undefined, tsconfig);
    if (parsed.options.noEmit) throw new Error("Build compilation requires emitted output; remove noEmit from the build configuration.");
    // Resolve the original project before redirecting output. Otherwise allowJs
    // projects accidentally compile their previous build into build/build/.
    const inside = (parent: string, file: string) => file === parent || file.startsWith(parent + path.sep);
    // Compact runners may place the source checkout inside the shared cache root.
    const generated = [outDir, buildRoot, inside(root, projectRoot) ? cache : root, parsed.options.outDir].filter(Boolean);
    const files = parsed.fileNames.filter((file: string) => !generated.some(directory => inside(directory, file)));
    const key = crypto.createHash("sha256").update(JSON.stringify(["bounded-generated-imports-v1", files, parsed.options, ts.version])).digest("hex");
    const previous = await fsp.readFile(path.join(cache, "key"), "utf8").catch(() => "");
    if (previous !== key) await fsp.rm(cache, {recursive: true, force: true});
    await fsp.mkdir(output, {recursive: true});
    console.log(`[webframez] TypeScript cache: ${previous === key ? "reuse" : "cold"} (${files.length} source files)`);
    try {
        const options = {...parsed.options, outDir: output, incremental: true, tsBuildInfoFile: path.join(cache, "build.tsbuildinfo")};
        const host = ts.createIncrementalCompilerHost(options);
        // JavaScript scripts may require the previous build for smoke checks.
        // Do not let those imports pull generated code and a second dependency
        // tree back into compilation. The last good output remains untouched.
        const hidden = (file: string) => file !== options.tsBuildInfoFile && generated.some(directory => inside(directory, path.resolve(file)));
        for (const name of ["fileExists", "directoryExists", "readFile"] as const) {
            const original = host[name]?.bind(host);
            if (original) host[name] = (file: string) => hidden(file) ? (name === "readFile" ? undefined : false) : original(file);
        }
        const builder = ts.createIncrementalProgram({rootNames: files, options, host, projectReferences: parsed.projectReferences});
        const diagnostics = [...(loaded.error ? [loaded.error] : []), ...parsed.errors, ...builder.getOptionsDiagnostics(), ...builder.getGlobalDiagnostics(), ...builder.getSyntacticDiagnostics(), ...builder.getSemanticDiagnostics()];
        if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCanonicalFileName: (name: string) => name, getCurrentDirectory: () => projectRoot, getNewLine: () => "\n"}));
        if (diagnostics.some((entry: any) => entry.category === ts.DiagnosticCategory.Error)) throw new Error("tsc exited with code 1");
        const emitted = builder.emit();
        if (emitted.diagnostics?.length) {
            console.error(ts.formatDiagnosticsWithColorAndContext(emitted.diagnostics, {getCanonicalFileName: (name: string) => name, getCurrentDirectory: () => projectRoot, getNewLine: () => "\n"}));
            if (emitted.diagnostics.some((entry: any) => entry.category === ts.DiagnosticCategory.Error)) throw new Error("tsc exited with code 1");
        }
        if (emitted.emitSkipped) throw new Error("tsc exited without emitting output");
        await fsp.cp(output, stagingDir, {recursive: true, mode: fs.constants.COPYFILE_FICLONE});
        await fsp.writeFile(path.join(cache, "key"), key);
    } catch (error) {
        await fsp.rm(cache, {recursive: true, force: true});
        throw error;
    }

}

if (require.main === module) {
    compile(JSON.parse(process.argv[2])).catch(error => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}
