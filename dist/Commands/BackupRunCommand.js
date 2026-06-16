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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupRunCommand = void 0;
const BackupManager_1 = require("../Backup/BackupManager");
const ConsoleCommand_1 = require("./ConsoleCommand");
function parseChannels(value) {
    if (!value || typeof value !== "string") {
        return undefined;
    }
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
}
function parsePositiveNumber(value) {
    if (!value || typeof value !== "string") {
        return undefined;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
class BackupRunCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.getArguments()[0];
            if (!key) {
                this.error("You must specify a backup key.");
                return;
            }
            const result = yield new BackupManager_1.BackupManager().run(key, {
                dryRun: this.getOption("dry-run") === true,
                full: this.getOption("full") === true,
                scheduledAt: typeof this.getOption("scheduled-at") === "string" ? this.getOption("scheduled-at") : undefined,
                channels: parseChannels(this.getOption("channel")),
                silent: this.getOption("silent") === true,
                logInterval: parsePositiveNumber(this.getOption("log-interval")),
                log: (message) => this.writeln(`  [color=grey]${message}[/color]`),
            });
            if (this.getOption("silent") === true) {
                return;
            }
            if (result.dryRun) {
                this.info(`Dry run for backup '${key}' finished.`);
            }
            else {
                this.success(`Backup '${key}' finished.`);
            }
            this.writeln(`  ID: ${result.id}`);
            if (result.kind) {
                this.writeln(`  Kind: ${result.kind}${result.chainId ? " (chain " + result.chainId + ")" : ""}`);
            }
            if (result.artifact) {
                this.writeln(`  Artifact: ${result.artifact.filename} (${result.artifact.size} bytes)`);
            }
            this.writeln(`  Files: ${result.files.length}`);
            this.writeln(`  Databases: ${result.databases.length}`);
            for (const output of result.outputs) {
                this.writeln(`  Output [color=blue]${output.driver}[/color]: [color=${output.status === "success" ? "green" : output.status === "failed" ? "red" : "grey"}]${output.status}[/color]${output.path ? " " + output.path : ""}${output.error ? " - " + output.error : ""}`);
            }
            for (const cleanup of result.cleanup) {
                this.writeln(`  Cleanup [color=blue]${cleanup.driver}[/color]: ${cleanup.deleted.length} deleted`);
            }
        });
    }
}
exports.BackupRunCommand = BackupRunCommand;
BackupRunCommand.signature = "backup:run";
BackupRunCommand.description = "Runs a configured backup type";
