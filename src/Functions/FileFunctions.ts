import path from "path";

const identifierBuild = "/build/node_modules/@webtypen/webframez-core";

export function isBuild() {
    if (__dirname.indexOf(identifierBuild) > 0) {
        return true;
    }
    return false;
}

export function rootDir(...args: any) {
    if (isBuild()) {
        return path.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), ...args);
    }

    const identifier = "/node_modules/@webtypen/webframez-core";
    return path.join(__dirname.substring(0, __dirname.indexOf(identifier)), ...args);
}

export function storageDir(...args: any) {
    if (process.env.STORAGE_DIR && process.env.STORAGE_DIR.trim() !== "") {
        return path.join(process.env.STORAGE_DIR, ...args);
    }
    if (isBuild()) {
        return path.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "storage", ...args);
    }

    const identifier = "/node_modules/@webtypen/webframez-core";
    return path.join(__dirname.substring(0, __dirname.indexOf(identifier)), "storage", ...args);
}

export function rootDirBuild(...args: any) {
    if (isBuild()) {
        return path.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "build", ...args);
    }

    const identifier = "/node_modules/@webtypen/webframez-core";
    return path.join(__dirname.substring(0, __dirname.indexOf(identifier)), "build", ...args);
}

export function storageDirBuild(...args: any) {
    if (isBuild()) {
        return path.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "build", "storage", ...args);
    }

    const identifier = "/node_modules/@webtypen/webframez-core";
    return path.join(__dirname.substring(0, __dirname.indexOf(identifier)), "build", "storage", ...args);
}
