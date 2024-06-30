import os from "os";

export class ConsoleProgressBar {
    total: number = 0;
    current: number = 0;
    barLength: number = 40;

    constructor(total: number) {
        this.total = total;
        this.current = 0;
        this.barLength = 40; // Länge der Fortschrittsanzeige in Zeichen
    }

    update(current: number) {
        this.current = current;
        this.render();
    }

    finish() {
        const progressText = "█".repeat(this.barLength);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`Progress: [${progressText}] | 100%` + os.EOL);
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
