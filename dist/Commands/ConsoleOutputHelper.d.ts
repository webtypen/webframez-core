export type WriteOptions = {
    formatDisabled?: boolean;
    minLength?: number;
    linesAfter?: number;
    linesBefore?: number;
    background?: string;
};
export declare class ConsoleOutputHelper {
    static formatText(text: string, options?: WriteOptions): string;
    static write(message: string, options?: WriteOptions): typeof ConsoleOutputHelper;
    static writeln(message: string, options?: WriteOptions): typeof ConsoleOutputHelper;
    static success(message: string, options?: WriteOptions): typeof ConsoleOutputHelper;
    static warning(message: string, options?: WriteOptions): typeof ConsoleOutputHelper;
    static info(message: string, options?: WriteOptions): typeof ConsoleOutputHelper;
    static error(message: string, options?: WriteOptions): typeof ConsoleOutputHelper;
    static resetFormat(): typeof ConsoleOutputHelper;
}
