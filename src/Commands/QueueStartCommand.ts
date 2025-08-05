import fs from "fs";
import path from "path";
import moment from "moment-timezone";
import { spawn } from "child_process";
import { ConsoleCommand } from "./ConsoleCommand";
import { storageDir } from "../Functions/FileFunctions";
import { Config } from "../Config";

export class QueueStartCommand extends ConsoleCommand {
    // Command
    static signature = "queue:start";
    static description = "Starts the queue based on the configuration";

    async handle() {
        const config = Config.get("queue");

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

                const statusPath = path.join(storageDir(), "queue", "worker_" + workerKey + ".json");
                if (fs.existsSync(statusPath)) {
                    try {
                        const file = JSON.parse(fs.readFileSync(statusPath, "utf8"));
                        if (file && file.pid && file.pid > 0) {
                            const isRunning = (() => {
                                try {
                                    // Signal 0 does not kill the process, just checks if it exists
                                    process.kill(parseInt(file.pid), 0);
                                    return true;
                                } catch (e) {
                                    return false;
                                }
                            })();

                            if (isRunning) {
                                this.writeln(
                                    `${workerKeyPadded} [color=orange]${"already running".padEnd(16, " ")}[/color] [color=grey]PID: ${
                                        file.pid
                                    }[/color]`
                                );
                                continue;
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }

                const logFilePath = path.join(storageDir(), "queue", "log_" + workerKey + ".log");
                const logDir = path.dirname(logFilePath);
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }

                if (!fs.existsSync(logFilePath)) {
                    fs.writeFileSync(logFilePath, "", "utf8");
                }

                fs.appendFileSync(logFilePath, `\n[${workerKey} | ${moment().format("YY-MM-DD HH:mm:ss")}] Starting worker\n`, "utf8");

                const command = `${process.argv[0]} ${process.argv[1]} queue:worker:autorestart --worker=${workerKey} --log=${logFilePath}`;
                try {
                    const child = spawn("/bin/bash", ["-c", command], {
                        detached: true,
                        stdio: "ignore",
                        cwd: process.cwd(),
                    });
                    child.unref();

                    const statusPath = path.join(storageDir(), "queue", "worker_" + workerKey + ".json");
                    const statusDir = path.dirname(statusPath);
                    if (!fs.existsSync(statusDir)) {
                        fs.mkdirSync(statusDir, { recursive: true });
                    }
                    fs.writeFileSync(
                        statusPath,
                        JSON.stringify({
                            pid: null,
                            worker: workerKey,
                            autorestart: true,
                            log_file: path.join("queue", "log_" + workerKey + ".log"),
                        }),
                        "utf8"
                    );

                    this.writeln(
                        `${workerKeyPadded} [color=green]${"started".padEnd(16, " ")}[/color] [color=grey]PID: ${child.pid}[/color]`
                    );
                } catch (error) {
                    this.writeln(`${workerKeyPadded} [color=red]${"failed".padEnd(16, " ")} ${error}[/color]`);
                }
            }
        }
    }
}
