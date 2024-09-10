export declare class ConsoleProgressBar {
    total: number;
    current: number;
    barLength: number;
    constructor(total: number);
    update(current: number): void;
    finish(): void;
    render(): void;
    increment(): void;
}
