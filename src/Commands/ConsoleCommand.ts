import readline from "readline";
import { ConsoleProgressBar } from "./ConsoleProgressBar";
import { ConsoleOutputHelper, WriteOptions } from "./ConsoleOutputHelper";

export class ConsoleCommand {
    static signature: string;
    static description?: string;

    rl: readline.Interface | null = null;
    currentProgress: ConsoleProgressBar | null = null;
    args: { arguments: string[]; options: { [key: string]: boolean | string } } = { arguments: [], options: {} };

    constructor(args?: { arguments: string[]; options: { [key: string]: boolean | string } }) {
        if (args && args.arguments) {
            this.args.arguments = args.arguments;
        }
        if (args && args.options) {
            this.args.options = args.options;
        }
    }

    async handle() {}

    async handleSystem() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

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

    getArguments() {
        return this.args.arguments;
    }

    getOptions() {
        return this.args.options;
    }

    getOption(name: string): string | boolean | null {
        return this.args.options[name] || null;
    }

    write(message: string, options?: WriteOptions) {
        ConsoleOutputHelper.writeln(message, options);
        return this;
    }

    writeln(message: string, options?: WriteOptions) {
        ConsoleOutputHelper.writeln(message, options);
        return this;
    }

    error(message: string, options?: WriteOptions) {
        ConsoleOutputHelper.error(message, options);
        return this;
    }

    success(message: string, options?: WriteOptions) {
        ConsoleOutputHelper.success(message, options);
        return this;
    }

    warning(message: string, options?: WriteOptions) {
        ConsoleOutputHelper.warning(message, options);
        return this;
    }

    info(message: string, options?: WriteOptions) {
        ConsoleOutputHelper.info(message, options);
        return this;
    }

    async ask(question: string) {
        const result = await new Promise((resolve) => {
            if (this.rl) {
                this.rl.question(question, (answer) => {
                    resolve(answer);
                });
            } else {
                resolve(null);
            }
        });
        return result;
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
