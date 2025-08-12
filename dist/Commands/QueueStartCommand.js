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
exports.QueueStartCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const child_process_1 = require("child_process");
const ConsoleCommand_1 = require("./ConsoleCommand");
const FileFunctions_1 = require("../Functions/FileFunctions");
const Config_1 = require("../Config");
class QueueStartCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const config = Config_1.Config.get("queue");
            if (!process.argv || !process.argv[0]) {
                this.error("Cannot determine the current process runtime.");
                return;
            }
            if (!process.argv[1] || process.argv[1].trim() === "") {
                this.error("Cannot determine the current process-dir.");
                return;
            }
            let maxWorkerKeyLength = 0;
            if (config && config.workers) {
                for (let workerKey in config.workers) {
                    if (workerKey.length > maxWorkerKeyLength) {
                        maxWorkerKeyLength = workerKey.length;
                    }
                }
            }
            if (config && config.workers) {
                for (let workerKey in config.workers) {
                    const workerConfig = config.workers[workerKey];
                    const workerKeyPadded = "[color=blue]" + workerKey.padEnd(maxWorkerKeyLength, " ") + ":[/color] ";
                    if (!workerConfig.is_active) {
                        this.writeln(`${workerKeyPadded} [color=red]inactive[/color]`);
                        continue;
                    }
                    const statusPath = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", "worker_" + workerKey + ".json");
                    if (fs_1.default.existsSync(statusPath)) {
                        try {
                            const file = JSON.parse(fs_1.default.readFileSync(statusPath, "utf8"));
                            if (file && file.pid && file.pid > 0) {
                                const isRunning = (() => {
                                    try {
                                        // Signal 0 does not kill the process, just checks if it exists
                                        process.kill(parseInt(file.pid), 0);
                                        return true;
                                    }
                                    catch (e) {
                                        return false;
                                    }
                                })();
                                if (isRunning) {
                                    this.writeln(`${workerKeyPadded} [color=orange]${"already running".padEnd(16, " ")}[/color] [color=grey]PID: ${file.pid}[/color]`);
                                    continue;
                                }
                            }
                        }
                        catch (e) {
                            console.error(e);
                        }
                    }
                    const logFilePath = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", "log_" + workerKey + ".log");
                    const logDir = path_1.default.dirname(logFilePath);
                    if (!fs_1.default.existsSync(logDir)) {
                        fs_1.default.mkdirSync(logDir, { recursive: true });
                    }
                    if (!fs_1.default.existsSync(logFilePath)) {
                        fs_1.default.writeFileSync(logFilePath, "", "utf8");
                    }
                    fs_1.default.appendFileSync(logFilePath, `\n[${workerKey} | ${(0, moment_timezone_1.default)().format("YY-MM-DD HH:mm:ss")}] Starting worker\n`, "utf8");
                    const command = `${process.argv[0]} ${process.argv[1]} queue:worker:autorestart --worker=${workerKey} --log=${logFilePath}`;
                    try {
                        const child = (0, child_process_1.spawn)("/bin/bash", ["-c", command], {
                            detached: true,
                            stdio: "ignore",
                            cwd: process.cwd(),
                        });
                        child.unref();
                        const statusPath = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", "worker_" + workerKey + ".json");
                        const statusDir = path_1.default.dirname(statusPath);
                        if (!fs_1.default.existsSync(statusDir)) {
                            fs_1.default.mkdirSync(statusDir, { recursive: true });
                        }
                        fs_1.default.writeFileSync(statusPath, JSON.stringify({
                            pid: null,
                            worker: workerKey,
                            autorestart: true,
                            log_file: path_1.default.join("queue", "log_" + workerKey + ".log"),
                        }), "utf8");
                        this.writeln(`${workerKeyPadded} [color=green]${"started".padEnd(16, " ")}[/color] [color=grey]PID: ${child.pid}[/color]`);
                    }
                    catch (error) {
                        this.writeln(`${workerKeyPadded} [color=red]${"failed".padEnd(16, " ")} ${error}[/color]`);
                    }
                }
            }
        });
    }
}
exports.QueueStartCommand = QueueStartCommand;
// Command
QueueStartCommand.signature = "queue:start";
QueueStartCommand.description = "Starts the queue based on the configuration";
