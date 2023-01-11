"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Response = void 0;
class Response {
    constructor(options) {
        this.statusCode = 200;
        this.headers = {};
        /**
         * Mode
         */
        this.mode = null;
        this.mode = options && options.mode ? options.mode : null;
    }
    /**
     * Sets the ServerResponse (res) Object (nodejs/http module)
     * @param res
     * @returns
     */
    setServerResponse(res) {
        this.res = res;
        return this;
    }
    /**
     * Set the http-status-code
     *
     * @param status
     * @returns
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
     * @returns
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
     */
    send(content) {
        var _a, _b, _c;
        this.content = content;
        if (this.mode === "aws-lambda") {
            // Do nothing ... Store content in variable and use it later ...
        }
        else {
            if (typeof content === "object") {
                (_a = this.res) === null || _a === void 0 ? void 0 : _a.setHeader("Content-Type", "application/json");
                (_b = this.res) === null || _b === void 0 ? void 0 : _b.write(JSON.stringify(content));
            }
            else {
                (_c = this.res) === null || _c === void 0 ? void 0 : _c.write(content);
            }
        }
        return this;
    }
}
exports.Response = Response;
