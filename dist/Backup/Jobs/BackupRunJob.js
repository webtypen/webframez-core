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
exports.BackupRunJob = void 0;
const BaseQueueJob_1 = require("../../Queue/BaseQueueJob");
const BackupManager_1 = require("../BackupManager");
class BackupRunJob extends BaseQueueJob_1.BaseQueueJob {
    handle(job) {
        return __awaiter(this, void 0, void 0, function* () {
            const backupKey = job && job.payload ? job.payload.backupKey : null;
            if (!backupKey || typeof backupKey !== "string") {
                throw new Error("BackupRunJob requires payload.backupKey.");
            }
            this.log(`Starting backup '${backupKey}'`);
            const result = yield new BackupManager_1.BackupManager().run(backupKey, {
                channels: job.payload.channels,
                log: (message, payload) => this.log(message, payload),
            });
            this.log(`Backup '${backupKey}' finished`, {
                id: result.id,
                outputs: result.outputs,
                cleanup: result.cleanup,
            });
        });
    }
}
exports.BackupRunJob = BackupRunJob;
