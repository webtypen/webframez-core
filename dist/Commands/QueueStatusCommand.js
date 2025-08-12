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
exports.QueueStatusCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Config_1 = require("../Config");
const ConsoleCommand_1 = require("./ConsoleCommand");
const FileFunctions_1 = require("../Functions/FileFunctions");
class QueueStatusCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const config = Config_1.Config.get("queue");
            if (!config || !config.workers || Object.keys(config.workers).length < 1) {
                this.error("No queue workers configured.");
                return;
            }
            let maxWorkerKeyLength = 0;
            let workers = [];
            for (let workerKey in config.workers) {
                let status = "inactive";
                let pid = null;
                const statusPath = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", "worker_" + workerKey + ".json");
                if (fs_1.default.existsSync(statusPath)) {
                    try {
                        const file = JSON.parse(fs_1.default.readFileSync(statusPath, "utf8"));
                        if (file && file.pid && parseInt(file.pid) > 0) {
                            pid = parseInt(file.pid);
                            const isRunning = (() => {
                                try {
                                    process.kill(parseInt(file.pid), 0);
                                    return true;
                                }
                                catch (e) {
                                    return false;
                                }
                            })();
                            status = isRunning ? "running" : "inactive";
                        }
                    }
                    catch (e) {
                        this.error(`Error reading status for worker ${workerKey}: ${e.message}`);
                    }
                }
                if (maxWorkerKeyLength < workerKey.length) {
                    maxWorkerKeyLength = workerKey.length;
                }
                workers.push({
                    worker: workerKey,
                    status: status,
                    pid: pid,
                });
            }
            this.writeln("Queue Workers Status:");
            if (workers && workers.length > 0) {
                workers.sort((a, b) => a.worker.localeCompare(b.worker));
                for (let worker of workers) {
                    const workerKeyPadded = "[color=blue]" + (worker.worker + ":").padEnd(maxWorkerKeyLength + 2, " ") + "[/color] ";
                    this.writeln(workerKeyPadded +
                        `[color=${worker.status === "running" ? "green" : "red"}]` +
                        worker.status.padEnd(9, " ") +
                        "[/color]" +
                        (worker.pid && worker.status === "running"
                            ? "[color=grey]PID: " +
                                (worker.pid ? worker.pid.toString() : "N/A").padEnd(8, " ") +
                                "[/color]" +
                                (worker.current_job
                                    ? "[color=grey]Job: " +
                                        (worker.current_job_number ? worker.current_job_number.toString().padEnd(8, " ") : "") +
                                        "[/color]"
                                    : "")
                            : ""));
                }
            }
            else {
                this.writeln("[color=red]No workers found.[/color]");
            }
        });
    }
}
exports.QueueStatusCommand = QueueStatusCommand;
QueueStatusCommand.signature = "queue:status";
QueueStatusCommand.description = "Displays the status of the queue workers";
