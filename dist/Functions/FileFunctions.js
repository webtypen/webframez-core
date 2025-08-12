"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageDirBuild = exports.rootDirBuild = exports.storageDir = exports.rootDir = exports.isBuild = void 0;
const path_1 = __importDefault(require("path"));
const identifierBuild = "/build/node_modules/@webtypen/webframez-core";
function isBuild() {
    if (__dirname.indexOf(identifierBuild) > 0) {
        return true;
    }
    return false;
}
exports.isBuild = isBuild;
function rootDir(...args) {
    if (isBuild()) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), ...args);
}
exports.rootDir = rootDir;
function storageDir(...args) {
    if (process.env.STORAGE_DIR && process.env.STORAGE_DIR.trim() !== "") {
        return path_1.default.join(process.env.STORAGE_DIR, ...args);
    }
    if (isBuild()) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "storage", ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), "storage", ...args);
}
exports.storageDir = storageDir;
function rootDirBuild(...args) {
    if (isBuild()) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "build", ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), "build", ...args);
}
exports.rootDirBuild = rootDirBuild;
function storageDirBuild(...args) {
    if (isBuild()) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "build", "storage", ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), "build", "storage", ...args);
}
exports.storageDirBuild = storageDirBuild;
