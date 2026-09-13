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
exports.Response = void 0;
const routing_1 = require("../routing");
const fs_1 = __importDefault(require("fs"));
const promises_1 = require("stream/promises");
const path_1 = __importDefault(require("path"));
const mime_types_1 = __importDefault(require("mime-types"));
class Response {
    constructor(options) {
        this.statusCode = 200;
        this.headers = {};
        this.events = { after: [] };
        /**
         * Mode
         */
        this.mode = null;
        this.mode = options && options.mode ? options.mode : null;
    }
    /**
     * Sets the ServerResponse (res) Object (nodejs/http module)
     * @param res
     * @returns Response
     */
    setServerResponse(res) {
        this.res = res;
        return this;
    }
    /** Redirect to an application URL, retaining external destinations unchanged. */
    redirect(location, status = 302) {
        return this.status(status).header("Location", (0, routing_1.appPath)(location)).send("");
    }
    /**
     * Set the http-status-code
     *
     * @param status
     * @returns Response
     */
    status(status) {
        this.statusCode = status;
        if (!this.res) {
            return this;
        }
        this.res.statusCode = status;
        return this;
    }
    /**
     * Set a header attribute: Content-Type: application/json
     *
     * @param type
     * @param value
     * @returns Response
     */
    header(type, value) {
        this.headers[type] = value;
        if (!this.res) {
            return this;
        }
        this.res.setHeader(type, value);
        return this;
    }
    /**
     * Sends data to the client
     * Any objects will be stringified to JSON
     *
     * @param content
     * @returns Response
     */
    send(content) {
        var _a, _b, _c, _d;
        this.content = content;
        if (this.mode === "aws-lambda") {
            // Do nothing ... Store content in variable and use it later ...
        }
        else {
            if (typeof content === "object" && !Buffer.isBuffer(content)) {
                if (!((_a = this.res) === null || _a === void 0 ? void 0 : _a.headersSent)) {
                    (_b = this.res) === null || _b === void 0 ? void 0 : _b.setHeader("Content-Type", "application/json");
                }
                (_c = this.res) === null || _c === void 0 ? void 0 : _c.write(JSON.stringify(content));
            }
            else {
                (_d = this.res) === null || _d === void 0 ? void 0 : _d.write(content);
            }
        }
        return this;
    }
    /**
     * Sends a CSV file to the client
     *
     * @param content
     * @param filename
     * @param options
     * @returns Response
     */
    sendCsv(content, filename = "export.csv", options) {
        return __awaiter(this, void 0, void 0, function* () {
            this.header("Content-Type", options && options.contentType ? options.contentType : "text/csv");
            this.header("Content-Disposition", (options && options.contentDisposition ? options.contentDisposition : "attachment") +
                ";filename=" +
                (filename ? filename : "export.csv"));
            let str = "";
            if (content && typeof content === "string") {
                str = content;
            }
            else if (content && Array.isArray(content) && content.length > 0) {
                for (let row of content) {
                    str +=
                        (str.trim() !== "" ? (options && options.eol ? options.eol : "\n") : "") +
                            row.join(options && options.seperator ? options.seperator : ";");
                }
            }
            return this.send((options && options.skipUtf8BOM ? "" : "\uFEFF") + str);
        });
    }
    /**
     * Streams a media file to the client
     *
     * @param req
     * @param filepath
     * @param filename
     * @param mimeType
     * @returns void
     */
    stream(req, filepath, filename, mimeType) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.res)
                throw new Error("Native Response-Objekt nicht verfügbar");
            const stats = yield fs_1.default.promises.stat(filepath);
            const total = stats.size;
            const range = String(((_a = req.headers) === null || _a === void 0 ? void 0 : _a.range) || ((_b = req.message) === null || _b === void 0 ? void 0 : _b.headers.range) || "");
            let start = 0, end = total - 1;
            if (range) {
                const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                if (!match || (!match[1] && !match[2])) {
                    return this.status(416).header("Content-Range", `bytes */${total}`).end();
                }
                if (!match[1]) {
                    const suffix = Number(match[2]);
                    start = Math.max(0, total - suffix);
                    if (suffix === 0)
                        start = total;
                }
                else {
                    start = Number(match[1]);
                    end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
                }
                if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= total || end < start) {
                    return this.status(416).header("Content-Range", `bytes */${total}`).end();
                }
                this.status(206).header("Content-Range", `bytes ${start}-${end}/${total}`);
            }
            this.header("Accept-Ranges", "bytes");
            this.header("Content-Length", String(range ? end - start + 1 : total));
            this.header("Content-Type", mimeType);
            this.header("Content-Disposition", `attachment; filename="${filename.replace(/["\r\n\\]/g, "_")}"`);
            if (total === 0)
                return this.end();
            yield (0, promises_1.pipeline)(fs_1.default.createReadStream(filepath, { start, end }), this.res);
        });
    }
    download(filepath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.res)
                throw new Error("Cannot download: Original response object is missing");
            const stats = yield fs_1.default.promises.stat(filepath);
            const mimeType = (options === null || options === void 0 ? void 0 : options.contentType) || ((options === null || options === void 0 ? void 0 : options.inline) && mime_types_1.default.lookup(filepath)) || "application/octet-stream";
            const filename = String((options === null || options === void 0 ? void 0 : options.filename) || path_1.default.basename(filepath)).replace(/["\r\n\\]/g, "_");
            this.header("Content-Disposition", `${(options === null || options === void 0 ? void 0 : options.inline) ? "inline" : "attachment"}; filename="${filename}"`);
            this.header("Content-Type", mimeType);
            this.header("Content-Length", String(stats.size));
            yield (0, promises_1.pipeline)(fs_1.default.createReadStream(filepath), this.res);
        });
    }
    end() {
        var _a;
        (_a = this.res) === null || _a === void 0 ? void 0 : _a.end();
        return this;
    }
    registerEvent(eventKey, func) {
        return __awaiter(this, void 0, void 0, function* () {
            this.events[eventKey].push({ function: func });
        });
    }
    /**
     * Runs the registered events for an event-type
     *
     * @param eventKey
     * @param req
     * @param payload
     */
    handleEvents(eventKey, req, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.events || !this.events[eventKey] || this.events[eventKey].length < 1) {
                return;
            }
            for (let i in this.events[eventKey]) {
                if (this.events[eventKey][i].function && typeof this.events[eventKey][i].function === "function") {
                    this.events[eventKey][i].function(req, payload);
                }
            }
        });
    }
}
exports.Response = Response;
