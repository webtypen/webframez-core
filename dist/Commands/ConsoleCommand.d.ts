/// <reference types="node" />
import readline from "readline";
import { ConsoleProgressBar } from "./ConsoleProgressBar";
export declare class ConsoleCommand {
    static signature: string;
    static description?: string;
    rl: readline.Interface | null;
    currentProgress: ConsoleProgressBar | null;
    handle(): Promise<void>;
    handleSystem(): Promise<void>;
    finallySystem(): Promise<void>;
    write(message: string): this;
    writeln(message: string): this;
    ask(question: string): Promise<unknown>;
    progress(count: number): this;
    progressIncrement(): this;
    progressFinish(): this;
}
