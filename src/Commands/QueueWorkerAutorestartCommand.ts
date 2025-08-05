import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { ConsoleCommand } from "./ConsoleCommand";
import { storageDir } from "../Functions/FileFunctions";

export class QueueWorkerAutorestartCommand extends ConsoleCommand {
    // Command
    static signature = "queue:worker:autorestart";
    static description = "Runs a specific queue worker with auto-restart";
    static hidden = true;

    private isRunning = true;
    private restartCount = 0;
    private maxRestarts = 100; // Maximale Anzahl von Neustarts

    async handle() {
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
        this.startWorker(worker as string, log as string);
    }

    private startWorker(worker: string, log: string) {
        if (!this.isRunning) {
            return;
        }

        const command = `${process.argv[0]} ${process.argv[1]} queue:worker --worker=${worker}`;

        this.info(`Starting worker ${worker} (restart #${this.restartCount})`);

        const child = spawn("/bin/bash", ["-c", `${command} >> ${log} 2>&1`], {
            detached: false,
            stdio: ["ignore", "pipe", "pipe"],
            cwd: process.cwd(),
        });

        child.on("exit", (code, signal) => {
            if (!this.isRunning) {
                return;
            }

            const autorestartStop = path.join(storageDir(), "queue", worker + ".stop-autorestart");
            if (fs.existsSync(autorestartStop)) {
                fs.unlinkSync(autorestartStop);
                this.shutdown();
                return;
            }

            this.restartCount++;

            if (code === 0) {
                this.info(`Worker ${worker} exited normally`);
            } else {
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

    private shutdown() {
        this.info("Shutting down auto-restart worker...");
        this.isRunning = false;
        process.exit(0);
    }
}
