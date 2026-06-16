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
exports.BackupRestorePointsCommand = void 0;
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
class BackupRestorePointsCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.getArguments()[0];
            if (!key) {
                this.error("You must specify a backup key.");
                return;
            }
            const points = yield new BackupManager_1.BackupManager().listRestorePoints(key, {
                channels: parseChannels(this.getOption("channel")),
            });
            this.info(`Restore points for backup '${key}':`);
            if (points.length < 1) {
                this.writeln("  [color=grey]No restore points found.[/color]");
                return;
            }
            for (const point of points) {
                this.writeln(`  [color=blue]${point.backupId}[/color] ${point.kind} ${point.filename} [color=grey]${point.createdAt.toISOString()}[/color]`);
            }
        });
    }
}
exports.BackupRestorePointsCommand = BackupRestorePointsCommand;
BackupRestorePointsCommand.signature = "backup:restore-points";
BackupRestorePointsCommand.description = "Lists restorable backup points";
