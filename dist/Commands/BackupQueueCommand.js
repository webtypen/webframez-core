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
exports.BackupQueueCommand = void 0;
const BackupRunJob_1 = require("../Backup/Jobs/BackupRunJob");
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
class BackupQueueCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.getArguments()[0];
            if (!key) {
                this.error("You must specify a backup key.");
                return;
            }
            const backupType = new BackupManager_1.BackupManager().resolveType(key);
            if (backupType.is_active === false) {
                this.error(`Backup type '${key}' is disabled.`);
                return;
            }
            const priority = this.getOption("priority");
            const worker = this.getOption("worker");
            const job = yield BackupRunJob_1.BackupRunJob.create({
                payload: {
                    backupKey: key,
                    channels: parseChannels(this.getOption("channel")),
                },
                priority: priority && typeof priority === "string" ? parseInt(priority) || 0 : 0,
                worker: worker && typeof worker === "string" ? worker : null,
            });
            this.success(`Queued backup '${key}' as job #${job.number}.`);
        });
    }
}
exports.BackupQueueCommand = BackupQueueCommand;
BackupQueueCommand.signature = "backup:queue";
BackupQueueCommand.description = "Creates a queue job for a configured backup type";
