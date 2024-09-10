"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleProgressBar = void 0;
const os_1 = __importDefault(require("os"));
class ConsoleProgressBar {
    constructor(total) {
        this.total = 0;
        this.current = 0;
        this.barLength = 40;
        this.total = total;
        this.current = 0;
        this.barLength = 40; // Länge der Fortschrittsanzeige in Zeichen
    }
    update(current) {
        this.current = current;
        this.render();
    }
    finish() {
        const progressText = "█".repeat(this.barLength);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`Progress: [${progressText}] | 100%` + os_1.default.EOL);
    }
    render() {
        const percentage = this.current / this.total;
        const progress = Math.round(this.barLength * percentage);
        const emptyProgress = this.barLength - progress;
        const progressText = "█".repeat(progress);
        const emptyProgressText = "░".repeat(emptyProgress);
        const percentageText = (percentage * 100).toFixed(2);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`Progress: [${progressText}${emptyProgressText}] | ${percentageText}%`);
    }
    increment() {
        this.current += 1;
        if (this.current > this.total) {
            this.current = this.total;
        }
        this.render();
    }
}
exports.ConsoleProgressBar = ConsoleProgressBar;
