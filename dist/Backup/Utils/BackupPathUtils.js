"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupTimestampId = exports.formatBackupFilename = exports.resolveProjectPath = exports.normalizeBackupPath = void 0;
const path_1 = __importDefault(require("path"));
const FileFunctions_1 = require("../../Functions/FileFunctions");
function normalizeBackupPath(value) {
    return value.replace(/\\/g, "/").replace(/^\/+/, "");
}
exports.normalizeBackupPath = normalizeBackupPath;
function resolveProjectPath(value, projectRoot = process.cwd()) {
    const normalized = normalizeBackupPath(value);
    if (process.env.STORAGE_DIR && process.env.STORAGE_DIR.trim() !== "" && normalized === "storage") {
        return (0, FileFunctions_1.storageDir)();
    }
    if (process.env.STORAGE_DIR && process.env.STORAGE_DIR.trim() !== "" && normalized.startsWith("storage/")) {
        return (0, FileFunctions_1.storageDir)(normalized.substring("storage/".length));
    }
    return path_1.default.isAbsolute(value) ? value : path_1.default.resolve(projectRoot, value);
}
exports.resolveProjectPath = resolveProjectPath;
function formatBackupFilename(template, values) {
    const date = values.date;
    const yyyy = date.getFullYear().toString();
    const mm = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");
    const hh = date.getHours().toString().padStart(2, "0");
    const min = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");
    return template
        .replace(/\{key\}/g, values.key)
        .replace(/\{id\}/g, values.id)
        .replace(/\{date\}/g, `${yyyy}-${mm}-${dd}`)
        .replace(/\{time\}/g, `${hh}-${min}-${ss}`)
        .replace(/\{datetime\}/g, `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`);
}
exports.formatBackupFilename = formatBackupFilename;
function backupTimestampId(date = new Date()) {
    return date.toISOString().replace(/[-:TZ.]/g, "");
}
exports.backupTimestampId = backupTimestampId;
