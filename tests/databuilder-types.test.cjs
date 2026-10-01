const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

test("published declarations accept unchanged v1 field objects, legacy overrides and new class extensions", () => {
    const program = ts.createProgram(
        [
            path.resolve(__dirname, "../test-support/databuilder-compatibility.ts"),
            path.resolve(__dirname, "../test-support/databuilder-example.ts"),
        ],
        {
            noEmit: true,
            strict: true,
            experimentalDecorators: true,
            esModuleInterop: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ES2018,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        },
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
        diagnostics.length,
        0,
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: (file) => file,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => "\n",
        }),
    );
});
