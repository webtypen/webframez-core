import fs from "fs";
import path from "path";
import { Config } from "../Config";
import { ConsoleCommand } from "./ConsoleCommand";
import { storageDir } from "../Functions/FileFunctions";

export class QueueStatusCommand extends ConsoleCommand {
    static signature = "queue:status";
    static description = "Displays the status of the queue workers";

    async handle() {
        const config = Config.get("queue");
        if (!config || !config.workers || Object.keys(config.workers).length < 1) {
            this.error("No queue workers configured.");
            return;
        }

        let maxWorkerKeyLength = 0;
        let workers: any[] = [];
        for (let workerKey in config.workers) {
            let status = "inactive";
            let pid = null;
            const statusPath = path.join(storageDir(), "queue", "worker_" + workerKey + ".json");
            if (fs.existsSync(statusPath)) {
                try {
                    const file = JSON.parse(fs.readFileSync(statusPath, "utf8"));
                    if (file && file.pid && parseInt(file.pid) > 0) {
                        pid = parseInt(file.pid);
                        const isRunning = (() => {
                            try {
                                process.kill(parseInt(file.pid), 0);
                                return true;
                            } catch (e) {
                                return false;
                            }
                        })();
                        status = isRunning ? "running" : "inactive";
                    }
                } catch (e: any) {
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
                this.writeln(
                    workerKeyPadded +
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
                            : "")
                );
            }
        } else {
            this.writeln("[color=red]No workers found.[/color]");
        }
    }
}
