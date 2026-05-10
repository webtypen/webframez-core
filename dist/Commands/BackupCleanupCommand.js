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
exports.BackupCleanupCommand = void 0;
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
class BackupCleanupCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.getArguments()[0];
            if (!key) {
                this.error("You must specify a backup key.");
                return;
            }
            const dryRun = this.getOption("dry-run") === true;
            const results = yield new BackupManager_1.BackupManager().cleanup(key, {
                dryRun: dryRun,
                channels: parseChannels(this.getOption("channel")),
            });
            if (dryRun) {
                this.info(`Dry cleanup for backup '${key}' finished.`);
            }
            else {
                this.success(`Cleanup for backup '${key}' finished.`);
            }
            for (const result of results) {
                this.writeln(`  [color=blue]${result.driver}[/color]: ${result.deleted.length} delete candidate(s)`);
                for (const entry of result.deleted) {
                    this.writeln(`    ${entry.filename} [color=grey]${entry.reason}[/color]`);
                }
            }
        });
    }
}
exports.BackupCleanupCommand = BackupCleanupCommand;
BackupCleanupCommand.signature = "backup:cleanup";
BackupCleanupCommand.description = "Removes old backup artifacts according to retention rules";
