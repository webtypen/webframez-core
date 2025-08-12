"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleCommand = void 0;
const readline_1 = __importDefault(require("readline"));
const ConsoleProgressBar_1 = require("./ConsoleProgressBar");
const ConsoleOutputHelper_1 = require("./ConsoleOutputHelper");
class ConsoleCommand {
    constructor(args) {
        this.rl = null;
        this.currentProgress = null;
        this.args = { arguments: [], options: {} };
        if (args && args.arguments) {
            this.args.arguments = args.arguments;
        }
        if (args && args.options) {
            this.args.options = args.options;
        }
    }
    handle() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    handleSystem() {
        return __awaiter(this, void 0, void 0, function* () {
            this.rl = readline_1.default.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            try {
                yield this.handle();
            }
            catch (e) {
                console.error(e);
            }
            finally {
                yield this.finallySystem();
            }
        });
    }
    finallySystem() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.rl) {
                this.rl.close();
            }
        });
    }
    getArguments() {
        return this.args.arguments;
    }
    getOptions() {
        return this.args.options;
    }
    getOption(name) {
        return this.args.options[name] || null;
    }
    write(message, options) {
        ConsoleOutputHelper_1.ConsoleOutputHelper.writeln(message, options);
        return this;
    }
    writeln(message, options) {
        ConsoleOutputHelper_1.ConsoleOutputHelper.writeln(message, options);
        return this;
    }
    error(message, options) {
        ConsoleOutputHelper_1.ConsoleOutputHelper.error(message, options);
        return this;
    }
    success(message, options) {
        ConsoleOutputHelper_1.ConsoleOutputHelper.success(message, options);
        return this;
    }
    warning(message, options) {
        ConsoleOutputHelper_1.ConsoleOutputHelper.warning(message, options);
        return this;
    }
    info(message, options) {
        ConsoleOutputHelper_1.ConsoleOutputHelper.info(message, options);
        return this;
    }
    ask(question) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield new Promise((resolve) => {
                if (this.rl) {
                    this.rl.question(question, (answer) => {
                        resolve(answer);
                    });
                }
                else {
                    resolve(null);
                }
            });
            return result;
        });
    }
    progress(count) {
        this.currentProgress = new ConsoleProgressBar_1.ConsoleProgressBar(count);
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
exports.ConsoleCommand = ConsoleCommand;
