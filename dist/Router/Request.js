"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Request = void 0;
class Request {
    constructor() {
        this.method = "GET";
        this.url = "";
        this.headers = {};
        this.rawHeaders = {};
        this.body = null;
        this.bodyPlain = null;
        this.query = {};
        this.queryRaw = "";
        this.params = {};
        this.files = {};
        this.socket = undefined;
        this.message = null;
        this.skipOptionsForward = false;
    }
    /**
     * Prevent the options request from getting an automatic 200 status code
     * @param status
     * @returns Response
     */
    setSkipOptionsForward(status) {
        this.skipOptionsForward = status;
        return this;
    }
}
exports.Request = Request;
