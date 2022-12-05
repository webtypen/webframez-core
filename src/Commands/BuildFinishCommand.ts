import { exec, execSync } from "child_process";
import fs from "fs";
import { ConsoleCommand } from "./ConsoleCommand";

export class BuildFinishCommand extends ConsoleCommand {
    static signature = "build";
    static description = "Creates a new production-build";

    async handle() {
        const buildDir = process.cwd() + "/build";
        const nodeModulesDir = process.cwd() + "/node_modules";
        if (!fs.existsSync(buildDir)) {
            throw new Error("Missing build folder `" + buildDir + "` ...");
        }

        if (!fs.existsSync(nodeModulesDir)) {
            throw new Error("Missing node_modules folder `" + nodeModulesDir + "` ...");
        }

        // Prepare node_modules/
        if (fs.existsSync(buildDir + "/node_modules")) {
            execSync("rm -rf " + buildDir + "/node_modules");
        }
        execSync("cp -r " + nodeModulesDir + " " + buildDir + "/node_modules");

        // Prepare files
        const copyFiles = [".env", "package.json", "package-lock.json", "README.md", ".gitignore"];
        for (let file of copyFiles) {
            if (fs.existsSync(buildDir + "/" + file)) {
                execSync("rm " + buildDir + "/" + file);
            }

            if (fs.existsSync(buildDir + "/" + file)) {
                execSync("cp " + process.cwd() + "/" + file + " " + buildDir + "/" + file);
            }
        }
    }
}
