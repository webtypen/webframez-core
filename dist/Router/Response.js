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
const fs_1 = __importDefault(require("fs"));
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
    download(filepath, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                if (!this.res) {
                    return reject("Cannot download: Original response object is missing");
                }
                if (!fs_1.default.existsSync(filepath)) {
                    return reject("Cannot download: File '" + filepath + "' does not exist");
                }
                let mimeType = options && options.contentType ? options.contentType : "application/octet-stream";
                if (options && options.inline) {
                    let tempMime = mime_types_1.default.lookup(filepath);
                    if (tempMime) {
                        mimeType = tempMime;
                    }
                }
                const stats = fs_1.default.lstatSync(filepath);
                this.header("Content-Disposition", (options && options.inline ? "inline" : "attachment") +
                    "; filename=" +
                    (options && options.filename ? options.filename : path_1.default.basename(filepath)));
                this.header("Content-Type", mimeType);
                this.header("Content-Length", stats.size.toString());
                const readStream = fs_1.default.createReadStream(filepath);
                readStream.pipe(this.res);
                readStream.on("close", () => {
                    resolve();
                });
                readStream.on("error", (streamErr) => {
                    console.error(streamErr);
                    reject(streamErr);
                });
            });
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
