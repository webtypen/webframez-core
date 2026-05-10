"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchesBackupGlobs = void 0;
const path_1 = __importDefault(require("path"));
const BackupPathUtils_1 = require("./BackupPathUtils");
function escapeRegexChar(char) {
    return /[\\^$+?.()|[\]{}]/.test(char) ? "\\" + char : char;
}
function globToRegex(pattern) {
    const normalized = (0, BackupPathUtils_1.normalizeBackupPath)(pattern);
    let out = "^";
    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        const next = normalized[index + 1];
        if (char === "*" && next === "*") {
            const after = normalized[index + 2];
            if (after === "/") {
                out += "(?:.*\\/)?";
                index += 2;
            }
            else {
                out += ".*";
                index += 1;
            }
            continue;
        }
        if (char === "*") {
            out += "[^/]*";
            continue;
        }
        if (char === "?") {
            out += "[^/]";
            continue;
        }
        out += escapeRegexChar(char);
    }
    out += "$";
    return new RegExp(out);
}
function matchesPattern(filepath, pattern) {
    const normalized = (0, BackupPathUtils_1.normalizeBackupPath)(filepath);
    const normalizedPattern = (0, BackupPathUtils_1.normalizeBackupPath)(pattern);
    const regex = globToRegex(normalizedPattern);
    if (regex.test(normalized)) {
        return true;
    }
    if (!normalizedPattern.includes("/")) {
        return regex.test(path_1.default.posix.basename(normalized));
    }
    return false;
}
function matchesBackupGlobs(filepath, include, exclude) {
    const includes = include && include.length > 0 ? include : ["**/*"];
    const excluded = exclude && exclude.some((pattern) => matchesPattern(filepath, pattern));
    if (excluded) {
        return false;
    }
    return includes.some((pattern) => matchesPattern(filepath, pattern));
}
exports.matchesBackupGlobs = matchesBackupGlobs;
