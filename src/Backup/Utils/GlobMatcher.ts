import path from "path";
import { normalizeBackupPath } from "./BackupPathUtils";

function escapeRegexChar(char: string) {
    return /[\\^$+?.()|[\]{}]/.test(char) ? "\\" + char : char;
}

function globToRegex(pattern: string) {
    const normalized = normalizeBackupPath(pattern);
    let out = "^";

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index];
        const next = normalized[index + 1];

        if (char === "*" && next === "*") {
            const after = normalized[index + 2];
            if (after === "/") {
                out += "(?:.*\\/)?";
                index += 2;
            } else {
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

function matchesPattern(filepath: string, pattern: string) {
    const normalized = normalizeBackupPath(filepath);
    const normalizedPattern = normalizeBackupPath(pattern);
    const regex = globToRegex(normalizedPattern);
    if (regex.test(normalized)) {
        return true;
    }

    if (!normalizedPattern.includes("/")) {
        return regex.test(path.posix.basename(normalized));
    }

    return false;
}

export function matchesBackupGlobs(filepath: string, include?: string[], exclude?: string[]) {
    const includes = include && include.length > 0 ? include : ["**/*"];
    const excluded = exclude && exclude.some((pattern) => matchesPattern(filepath, pattern));
    if (excluded) {
        return false;
    }

    return includes.some((pattern) => matchesPattern(filepath, pattern));
}
