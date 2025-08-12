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
exports.QueueWorkerAutorestartCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const ConsoleCommand_1 = require("./ConsoleCommand");
const FileFunctions_1 = require("../Functions/FileFunctions");
class QueueWorkerAutorestartCommand extends ConsoleCommand_1.ConsoleCommand {
    constructor() {
        super(...arguments);
        this.isRunning = true;
        this.restartCount = 0;
        this.maxRestarts = 100; // Maximale Anzahl von Neustarts
    }
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const log = this.getOption("log");
            const worker = this.getOption("worker");
            if (!worker) {
                this.error("No worker specified. Use --worker=<worker_key>");
                return;
            }
            // Graceful shutdown bei SIGINT/SIGTERM
            process.on("SIGINT", () => this.shutdown());
            process.on("SIGTERM", () => this.shutdown());
            this.info(`Starting auto-restart worker: ${worker}`);
            this.startWorker(worker, log);
        });
    }
    startWorker(worker, log) {
        if (!this.isRunning) {
            return;
        }
        const command = `${process.argv[0]} ${process.argv[1]} queue:worker --worker=${worker}`;
        this.info(`Starting worker ${worker} (restart #${this.restartCount})`);
        const child = (0, child_process_1.spawn)("/bin/bash", ["-c", `${command} >> ${log} 2>&1`], {
            detached: false,
            stdio: ["ignore", "pipe", "pipe"],
            cwd: process.cwd(),
        });
        child.on("exit", (code, signal) => {
            if (!this.isRunning) {
                return;
            }
            const autorestartStop = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", worker + ".stop-autorestart");
            if (fs_1.default.existsSync(autorestartStop)) {
                fs_1.default.unlinkSync(autorestartStop);
                this.shutdown();
                return;
            }
            this.restartCount++;
            if (code === 0) {
                this.info(`Worker ${worker} exited normally`);
            }
            else {
                this.error(`Worker ${worker} crashed with code ${code} and signal ${signal}`);
            }
            if (this.restartCount >= this.maxRestarts) {
                this.error(`Maximum restart limit (${this.maxRestarts}) reached. Stopping auto-restart.`);
                this.shutdown();
                return;
            }
            // Kurze Verzögerung vor Neustart um CPU-Last zu vermeiden
            setTimeout(() => {
                if (this.isRunning) {
                    this.startWorker(worker, log);
                }
            }, 500);
        });
        child.on("error", (error) => {
            this.error(`Failed to start worker ${worker}: ${error.message}`);
            if (this.isRunning) {
                setTimeout(() => {
                    this.startWorker(worker, log);
                }, 2000);
            }
        });
    }
    shutdown() {
        this.info("Shutting down auto-restart worker...");
        this.isRunning = false;
        process.exit(0);
    }
}
exports.QueueWorkerAutorestartCommand = QueueWorkerAutorestartCommand;
// Command
QueueWorkerAutorestartCommand.signature = "queue:worker:autorestart";
QueueWorkerAutorestartCommand.description = "Runs a specific queue worker with auto-restart";
QueueWorkerAutorestartCommand.hidden = true;
