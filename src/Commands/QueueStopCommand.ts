import fs from "fs";
import path from "path";
import { ConsoleCommand } from "./ConsoleCommand";
import { storageDir } from "../Functions/FileFunctions";

export class QueueStopCommand extends ConsoleCommand {
    static signature = "queue:stop";
    static description = "Stops the queue based on the configuration";

    async handle() {
        const workersDir = path.join(storageDir(), "queue");
        if (!fs.existsSync(workersDir)) {
            this.error("No workers found to stop.");
            return;
        }

        const workers = fs.readdirSync(workersDir).filter((file) => file.startsWith("worker_") && file.endsWith(".json"));
        if (!workers || workers.length < 1) {
            this.error("No active workers found to stop.");
            return;
        }

        const stopping: any[] = [];
        for (let workerJson of workers) {
            if (!workerJson || !workerJson.startsWith("worker_") || !workerJson.endsWith(".json")) continue;
            const workerKey = workerJson.replace("worker_", "").replace(".json", "");
            if (!workerKey || workerKey.trim() === "") continue;

            const statusPath = path.join(storageDir(), "queue", workerJson);
            if (fs.existsSync(statusPath)) {
                let json: any = null;
                try {
                    json = JSON.parse(fs.readFileSync(statusPath, "utf8"));
                    if (json && json.pid) {
                        stopping.push({
                            worker: workerKey,
                            pid: json.pid,
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }

        if (stopping.length < 1) {
            this.error("No workers found to stop.");
        } else {
            this.writeln("Stopping workers: " + stopping.map((w) => `${w.worker} (PID: ${w.pid})`).join(", "));
        }

        let promises: Promise<void>[] = [];
        for (let worker of stopping) {
            if (!worker || !worker.worker || !worker.pid) return;

            promises.push(
                new Promise(async (resolve) => {
                    try {
                        await this.stopWorker(worker.worker, worker.pid);
                    } catch (e: any) {
                        this.error(`Error stopping worker ${worker.worker}: ${e.message}`);
                    } finally {
                        if (fs.existsSync(path.join(storageDir(), "queue", worker.worker + ".stop"))) {
                            fs.unlinkSync(path.join(storageDir(), "queue", worker.worker + ".stop"));
                        }
                    }
                    resolve();
                })
            );
        }
        await Promise.all(promises);
    }

    isRunning(pid: number) {
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            return false;
        }
    }

    async stopWorker(workerKey: string, pid: number) {
        if (!workerKey || !pid) return;

        if (!this.isRunning(pid)) {
            this.writeln(`- Worker ${workerKey} (PID: ${pid}) is not running: Do not stop`);
            return;
        }

        fs.writeFileSync(
            path.join(storageDir(), "queue", workerKey + ".stop"),
            JSON.stringify({ date: new Date(), worker: workerKey, pid: pid }),
            "utf8"
        );

        let isRunning = this.isRunning(pid);
        while (isRunning) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            isRunning = this.isRunning(pid);
        }

        this.writeln(`- Worker ${workerKey} (PID: ${pid}) stopped successfully.`);
    }
}
