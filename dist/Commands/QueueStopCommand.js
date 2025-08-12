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
exports.QueueStopCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ConsoleCommand_1 = require("./ConsoleCommand");
const FileFunctions_1 = require("../Functions/FileFunctions");
class QueueStopCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const workersDir = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue");
            if (!fs_1.default.existsSync(workersDir)) {
                this.error("No workers found to stop.");
                return;
            }
            const workers = fs_1.default.readdirSync(workersDir).filter((file) => file.startsWith("worker_") && file.endsWith(".json"));
            if (!workers || workers.length < 1) {
                this.error("No active workers found to stop.");
                return;
            }
            const stopping = [];
            for (let workerJson of workers) {
                if (!workerJson || !workerJson.startsWith("worker_") || !workerJson.endsWith(".json"))
                    continue;
                const workerKey = workerJson.replace("worker_", "").replace(".json", "");
                if (!workerKey || workerKey.trim() === "")
                    continue;
                const statusPath = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", workerJson);
                if (fs_1.default.existsSync(statusPath)) {
                    let json = null;
                    try {
                        json = JSON.parse(fs_1.default.readFileSync(statusPath, "utf8"));
                        if (json && json.pid) {
                            stopping.push({
                                worker: workerKey,
                                pid: json.pid,
                            });
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
            }
            if (stopping.length < 1) {
                this.error("No workers found to stop.");
            }
            else {
                this.writeln("Stopping workers: " + stopping.map((w) => `${w.worker} (PID: ${w.pid})`).join(", "));
            }
            let promises = [];
            for (let worker of stopping) {
                if (!worker || !worker.worker || !worker.pid)
                    return;
                promises.push(new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield this.stopWorker(worker.worker, worker.pid);
                    }
                    catch (e) {
                        this.error(`Error stopping worker ${worker.worker}: ${e.message}`);
                    }
                    finally {
                        if (fs_1.default.existsSync(path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", worker.worker + ".stop"))) {
                            fs_1.default.unlinkSync(path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", worker.worker + ".stop"));
                        }
                    }
                    resolve();
                })));
            }
            yield Promise.all(promises);
        });
    }
    isRunning(pid) {
        try {
            process.kill(pid, 0);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    stopWorker(workerKey, pid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!workerKey || !pid)
                return;
            if (!this.isRunning(pid)) {
                this.writeln(`- Worker ${workerKey} (PID: ${pid}) is not running: Do not stop`);
                return;
            }
            fs_1.default.writeFileSync(path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", workerKey + ".stop"), JSON.stringify({ date: new Date(), worker: workerKey, pid: pid }), "utf8");
            let isRunning = this.isRunning(pid);
            while (isRunning) {
                yield new Promise((resolve) => setTimeout(resolve, 100));
                isRunning = this.isRunning(pid);
            }
            this.writeln(`- Worker ${workerKey} (PID: ${pid}) stopped successfully.`);
        });
    }
}
exports.QueueStopCommand = QueueStopCommand;
QueueStopCommand.signature = "queue:stop";
QueueStopCommand.description = "Stops the queue based on the configuration";
