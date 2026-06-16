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
exports.BackupRestoreCommand = void 0;
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
class BackupRestoreCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.getArguments()[0];
            const targetDir = this.getArguments()[1];
            if (!key) {
                this.error("You must specify a backup key.");
                return;
            }
            const backupId = this.getOption("backup-id");
            const result = yield new BackupManager_1.BackupManager().restore(key, targetDir, {
                backupId: typeof backupId === "string" ? backupId.trim() : undefined,
                channels: parseChannels(this.getOption("channel")),
                dryRun: this.getOption("dry-run") === true,
            });
            if (!backupId) {
                this.info(`Restore points for backup '${key}':`);
                for (const point of result.restorePoints || []) {
                    this.writeln(`  [color=blue]${point.backupId}[/color] ${point.kind} ${point.filename} [color=grey]${point.createdAt.toISOString()}[/color]`);
                }
                return;
            }
            if (result.dryRun) {
                this.info(`Dry restore for backup '${key}' finished.`);
            }
            else {
                this.success(`Restore for backup '${key}' finished.`);
            }
            this.writeln(`  Target: ${result.targetDir}`);
            this.writeln(`  Chain: ${(result.chain || []).map((point) => `${point.backupId}:${point.kind}`).join(", ")}`);
            this.writeln(`  Restored artifacts: ${((_a = result.restored) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
            this.writeln(`  Deleted files: ${((_b = result.deleted) === null || _b === void 0 ? void 0 : _b.length) || 0}`);
        });
    }
}
exports.BackupRestoreCommand = BackupRestoreCommand;
BackupRestoreCommand.signature = "backup:restore";
BackupRestoreCommand.description = "Restores a configured backup into a new or empty directory";
