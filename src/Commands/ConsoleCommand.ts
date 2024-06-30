import os from "os";
import readline from "readline";
import { ConsoleProgressBar } from "./ConsoleProgressBar";

export class ConsoleCommand {
    static signature: string;
    static description?: string;

    rl: readline.Interface | null;
    currentProgress: ConsoleProgressBar | null = null;

    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    async handle() {}

    async handleSystem() {
        try {
            await this.handle();
        } catch (e) {
            console.error(e);
        } finally {
            await this.finallySystem();
        }
    }

    async finallySystem() {
        if (this.rl) {
            this.rl.close();
        }
    }

    write(message: string) {
        process.stdout.write(message);
        return this;
    }

    writeln(message: string) {
        process.stdout.write(message + os.EOL);
        return this;
    }

    ask(question: string) {
        return new Promise((resolve) => {
            if (this.rl) {
                this.rl.question(question, (answer) => {
                    resolve(answer);
                });
            }
            resolve(null);
        });
    }

    progress(count: number) {
        this.currentProgress = new ConsoleProgressBar(count);
        this.currentProgress.render();
        return this;
    }

    progressIncrement() {
        if (this.currentProgress) {
            this.currentProgress.increment();
        }
        return this;
    }

    progressFinish() {
        if (this.currentProgress) {
            this.currentProgress.finish();
        }
        return this;
    }
}
