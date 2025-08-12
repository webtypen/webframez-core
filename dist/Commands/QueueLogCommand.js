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
exports.QueueLogCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const Config_1 = require("../Config");
const ConsoleCommand_1 = require("./ConsoleCommand");
const FileFunctions_1 = require("../Functions/FileFunctions");
const ConsoleOutputHelper_1 = require("./ConsoleOutputHelper");
class QueueLogCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const config = Config_1.Config.get("queue");
            if (!config || !config.workers || Object.keys(config.workers).length < 1) {
                this.error("No queue workers configured.");
                return;
            }
            const files = [];
            const args = this.getArguments();
            for (let workerKey in config.workers) {
                if (args && args.length > 0 && !args.find((arg) => arg && arg.trim() === workerKey)) {
                    continue;
                }
                const statusPath = path_1.default.join((0, FileFunctions_1.storageDir)(), "queue", "worker_" + workerKey + ".json");
                if (fs_1.default.existsSync(statusPath)) {
                    try {
                        const file = JSON.parse(fs_1.default.readFileSync(statusPath, "utf8"));
                        if (file && file.log_file && fs_1.default.existsSync(path_1.default.join((0, FileFunctions_1.storageDir)(), file.log_file))) {
                            files.push(path_1.default.join((0, FileFunctions_1.storageDir)(), file.log_file));
                        }
                    }
                    catch (e) {
                        this.error(`Error reading status for worker ${workerKey}: ${e.message}`);
                    }
                }
            }
            if (files.length === 0) {
                this.error("No log files found for any workers.");
                return;
            }
            this.writeln(`[color=orange]Following ${files.length} worker-log-file(s):[/color]`);
            files.forEach((file) => this.writeln(`- ${file}`));
            this.writeln("[color=grey]Press Ctrl+C to stop...[/color]");
            this.writeln("".padEnd(80, "-"));
            this.writeln("");
            const tailProcess = (0, child_process_1.spawn)("tail", ["-f", ...files], {
                stdio: ["pipe", "pipe", "pipe"],
            });
            (_a = tailProcess.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (data) => {
                const lines = data.toString().split("\n");
                for (const line of lines) {
                    if (!line.trim() || line.startsWith("==>") || line.includes("<==")) {
                        continue;
                    }
                    if (line.startsWith("[")) {
                        const match = line.match(/^(\[.*?\])(.*)/);
                        if (match) {
                            const blueText = `[color=blue]${match[1]}[/color]`; // Blue color
                            const restText = match[2];
                            ConsoleOutputHelper_1.ConsoleOutputHelper.writeln(blueText + restText);
                        }
                        else {
                            ConsoleOutputHelper_1.ConsoleOutputHelper.writeln(line, { formatDisabled: true });
                        }
                    }
                    else {
                        ConsoleOutputHelper_1.ConsoleOutputHelper.writeln(line, { formatDisabled: true });
                    }
                }
            });
            (_b = tailProcess.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (data) => {
                this.error(`tail error: ${data.toString()}`);
            });
            tailProcess.on("close", (code) => {
                if (code !== 0) {
                    this.error(`tail process exited with code ${code}`);
                }
            });
            process.on("SIGINT", () => {
                tailProcess.kill("SIGTERM");
                process.exit(0);
            });
        });
    }
}
exports.QueueLogCommand = QueueLogCommand;
QueueLogCommand.signature = "queue:log";
QueueLogCommand.description = "Displays the log files of the queue workers";
