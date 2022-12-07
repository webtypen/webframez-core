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
exports.BuildFinishCommand = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const ConsoleCommand_1 = require("./ConsoleCommand");
class BuildFinishCommand extends ConsoleCommand_1.ConsoleCommand {
    handle() {
        return __awaiter(this, void 0, void 0, function* () {
            const buildDir = process.cwd() + "/build";
            const nodeModulesDir = process.cwd() + "/node_modules";
            if (!fs_1.default.existsSync(buildDir)) {
                throw new Error("Missing build folder `" + buildDir + "` ...");
            }
            if (!fs_1.default.existsSync(nodeModulesDir)) {
                throw new Error("Missing node_modules folder `" + nodeModulesDir + "` ...");
            }
            // Prepare node_modules/
            if (fs_1.default.existsSync(buildDir + "/node_modules")) {
                (0, child_process_1.execSync)("rm -rf " + buildDir + "/node_modules");
            }
            (0, child_process_1.execSync)("cp -r " + nodeModulesDir + " " + buildDir + "/node_modules");
            // Prepare files
            const copyFiles = [".env", "package.json", "package-lock.json", "README.md", ".gitignore"];
            for (let file of copyFiles) {
                if (fs_1.default.existsSync(buildDir + "/" + file)) {
                    (0, child_process_1.execSync)("rm " + buildDir + "/" + file);
                }
                if (fs_1.default.existsSync(process.cwd() + "/" + file)) {
                    (0, child_process_1.execSync)("cp " + process.cwd() + "/" + file + " " + buildDir + "/" + file);
                }
            }
        });
    }
}
exports.BuildFinishCommand = BuildFinishCommand;
BuildFinishCommand.signature = "build";
BuildFinishCommand.description = "Creates a new production-build";
