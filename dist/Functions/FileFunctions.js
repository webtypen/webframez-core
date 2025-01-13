"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageDirBuild = exports.rootDirBuild = exports.storageDir = exports.rootDir = void 0;
const path_1 = __importDefault(require("path"));
function rootDir(...args) {
    const identifierBuild = "/build/node_modules/@webtypen/webframez-core";
    if (__dirname.indexOf(identifierBuild) > 0) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), ...args);
}
exports.rootDir = rootDir;
function storageDir(...args) {
    const identifierBuild = "/build/node_modules/@webtypen/webframez-core";
    if (__dirname.indexOf(identifierBuild) > 0) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "storage", ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), "storage", ...args);
}
exports.storageDir = storageDir;
function rootDirBuild(...args) {
    const identifierBuild = "/build/node_modules/@webtypen/webframez-core";
    if (__dirname.indexOf(identifierBuild) > 0) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "build", ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), "build", ...args);
}
exports.rootDirBuild = rootDirBuild;
function storageDirBuild(...args) {
    const identifierBuild = "/build/node_modules/@webtypen/webframez-core";
    if (__dirname.indexOf(identifierBuild) > 0) {
        return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifierBuild)), "build", "storage", ...args);
    }
    const identifier = "/node_modules/@webtypen/webframez-core";
    return path_1.default.join(__dirname.substring(0, __dirname.indexOf(identifier)), "build", "storage", ...args);
}
exports.storageDirBuild = storageDirBuild;
