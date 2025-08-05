import os from "os";

export type WriteOptions = {
    formatDisabled?: boolean;
    minLength?: number;
    linesAfter?: number;
    linesBefore?: number;
    background?: string;
};

export class ConsoleOutputHelper {
    static formatText(text: string, options?: WriteOptions) {
        if (!text || options?.formatDisabled) return text;

        // ANSI-Codes für Textfarben
        const colors: Record<string, string> = {
            reset: "\x1b[0m",
            black: "\x1b[30m",
            red: "\x1b[31m",
            green: "\x1b[32m",
            yellow: "\x1b[33m",
            blue: "\x1b[34m",
            magenta: "\x1b[35m",
            cyan: "\x1b[36m",
            white: "\x1b[37m",
            grey: "\x1b[90m",
            orange: "\x1b[38;5;214m",
        };

        // ANSI-Codes für Hintergrundfarben
        const backgroundColors: Record<string, string> = {
            reset: "\x1b[49m",
            black: "\x1b[40m",
            red: "\x1b[41m",
            green: "\x1b[42m",
            yellow: "\x1b[43m",
            blue: "\x1b[44m",
            magenta: "\x1b[45m",
            cyan: "\x1b[46m",
            white: "\x1b[47m",
            grey: "\x1b[100m",
        };

        // ANSI-Codes für Textstile
        const styles: Record<string, { open: string; close: string }> = {
            b: { open: "\x1b[1m", close: "\x1b[22m" }, // Bold
            i: { open: "\x1b[3m", close: "\x1b[23m" }, // Italic
            u: { open: "\x1b[4m", close: "\x1b[24m" }, // Underline
            s: { open: "\x1b[9m", close: "\x1b[29m" }, // Strikethrough
        };

        let result = text;
        const stack: Array<{ type: string; value?: string }> = [];

        // Regex für verschiedene Tag-Typen
        const tagPattern = /\[(color|background)=(\w+)\]|\[\/(color|background)\]|\[([bius])\]|\[\/([bius])\]/g;
        let match;
        let processedText = "";
        let lastIndex = 0;

        while ((match = tagPattern.exec(result)) !== null) {
            // Text vor dem Tag hinzufügen
            processedText += result.substring(lastIndex, match.index);

            if (match[1] && match[2]) {
                // Opening color/background tag: [color=red] oder [background=blue]
                const tagType = match[1];
                const colorName = match[2].toLowerCase();

                stack.push({ type: tagType, value: colorName });

                if (tagType === "color" && colors[colorName]) {
                    processedText += colors[colorName];
                } else if (tagType === "background" && backgroundColors[colorName]) {
                    processedText += backgroundColors[colorName];
                }
            } else if (match[3]) {
                // Closing color/background tag: [/color] oder [/background]
                const tagType = match[3];

                // Finde das letzte passende Tag im Stack
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i].type === tagType) {
                        stack.splice(i, 1);
                        break;
                    }
                }

                if (tagType === "color") {
                    processedText += "\x1b[39m"; // Reset nur Textfarbe
                } else if (tagType === "background") {
                    processedText += backgroundColors.reset; // Reset nur Hintergrund
                }

                // Andere aktive Formatierungen wieder anwenden
                for (const activeTag of stack) {
                    if (activeTag.type === "color" && activeTag.value && colors[activeTag.value]) {
                        processedText += colors[activeTag.value];
                    } else if (activeTag.type === "background" && activeTag.value && backgroundColors[activeTag.value]) {
                        processedText += backgroundColors[activeTag.value];
                    }
                }
            } else if (match[5]) {
                // Opening style tag: [b], [i], [u], [s]
                const styleType = match[5];

                if (styles[styleType]) {
                    stack.push({ type: styleType });
                    processedText += styles[styleType].open;
                }
            } else if (match[6]) {
                // Closing style tag: [/b], [/i], [/u], [/s]
                const styleType = match[6];

                // Finde das letzte passende Tag im Stack
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i].type === styleType) {
                        stack.splice(i, 1);
                        break;
                    }
                }

                if (styles[styleType]) {
                    processedText += styles[styleType].close;
                }
            }

            lastIndex = match.index + match[0].length;
        }

        // Restlichen Text hinzufügen
        processedText += result.substring(lastIndex);

        // Alle offenen Tags schließen
        for (const openTag of stack) {
            if (openTag.type === "color") {
                processedText += "\x1b[39m";
            } else if (openTag.type === "background") {
                processedText += backgroundColors.reset;
            } else if (styles[openTag.type]) {
                processedText += styles[openTag.type].close;
            }
        }

        // MinLength-Option anwenden
        if (options?.minLength && processedText.length < options.minLength) {
            const padding = " ".repeat(options.minLength - processedText.length);
            processedText += padding;

            if (options.background) {
                const { background, minLength, ...restOptions } = options;
                processedText = ConsoleOutputHelper.formatText(`[background=${background}]${processedText}[/background]`, restOptions);
            }
        }

        return processedText;
    }

    static write(message: string, options?: WriteOptions) {
        if (options && options.linesBefore) {
            for (let i = 0; i < options.linesBefore; i++) {
                process.stdout.write(os.EOL);
            }
        }

        process.stdout.write(options?.formatDisabled ? message : ConsoleOutputHelper.formatText(message, options));

        if (options && options.linesAfter) {
            for (let i = 0; i < options.linesAfter; i++) {
                process.stdout.write(os.EOL);
            }
        }
        return this;
    }

    static writeln(message: string, options?: WriteOptions) {
        if (options && options.linesBefore) {
            for (let i = 0; i < options.linesBefore; i++) {
                process.stdout.write(os.EOL);
            }
        }

        process.stdout.write(options?.formatDisabled ? message : ConsoleOutputHelper.formatText(message, options) + os.EOL);

        if (options && options.linesAfter) {
            for (let i = 0; i < options.linesAfter; i++) {
                process.stdout.write(os.EOL);
            }
        }
        return this;
    }

    static success(message: string, options?: WriteOptions) {
        const formattedMessage = `[background=green][color=white][b] SUCCESS [/b][/color][/background] [color=green]${message}[/color]`;
        return this.writeln(formattedMessage, {
            linesBefore: 1,
            linesAfter: 1,
            ...options,
        });
    }

    static warning(message: string, options?: WriteOptions) {
        const formattedMessage = `[background=orange][color=white][b] WARNING [/b][/color][/background] [color=orange]${message}[/color]`;
        return this.writeln(formattedMessage, {
            linesBefore: 1,
            linesAfter: 1,
            ...options,
        });
    }

    static info(message: string, options?: WriteOptions) {
        const formattedMessage = `[background=blue][color=white][b] INFO [/b][/color][/background] [color=blue]${message}[/color]`;
        return this.writeln(formattedMessage, {
            linesBefore: 1,
            linesAfter: 1,
            ...options,
        });
    }

    static error(message: string, options?: WriteOptions) {
        const formattedMessage = `[background=red][color=white][b] ERROR [/b][/color][/background] [color=red]${message}[/color]`;
        return this.writeln(formattedMessage, {
            linesBefore: 1,
            linesAfter: 1,
            ...options,
        });
    }

    static resetFormat() {
        process.stdout.write("\x1b[0m");
        return this;
    }
}
