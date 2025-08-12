/// <reference types="node" />
import readline from "readline";
import { ConsoleProgressBar } from "./ConsoleProgressBar";
import { WriteOptions } from "./ConsoleOutputHelper";
export declare class ConsoleCommand {
    static signature: string;
    static description?: string;
    rl: readline.Interface | null;
    currentProgress: ConsoleProgressBar | null;
    args: {
        arguments: string[];
        options: {
            [key: string]: boolean | string;
        };
    };
    constructor(args?: {
        arguments: string[];
        options: {
            [key: string]: boolean | string;
        };
    });
    handle(): Promise<void>;
    handleSystem(): Promise<void>;
    finallySystem(): Promise<void>;
    getArguments(): string[];
    getOptions(): {
        [key: string]: string | boolean;
    };
    getOption(name: string): string | boolean | null;
    write(message: string, options?: WriteOptions): this;
    writeln(message: string, options?: WriteOptions): this;
    error(message: string, options?: WriteOptions): this;
    success(message: string, options?: WriteOptions): this;
    warning(message: string, options?: WriteOptions): this;
    info(message: string, options?: WriteOptions): this;
    ask(question: string): Promise<unknown>;
    progress(count: number): this;
    progressIncrement(): this;
    progressFinish(): this;
}
