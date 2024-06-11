import fs from "fs";
import path from "path";
import mime from "mime-types";
import { ServerResponse } from "http";

export class Response {
    res?: ServerResponse;
    statusCode: number = 200;
    content?: any | null | undefined;
    headers: { [key: string]: any } = {};
    events: any = { after: [] };

    /**
     * Mode
     */
    mode: any | null = null;

    constructor(options?: any | null | undefined) {
        this.mode = options && options.mode ? options.mode : null;
    }

    /**
     * Sets the ServerResponse (res) Object (nodejs/http module)
     * @param res
     * @returns Response
     */
    setServerResponse(res: ServerResponse) {
        this.res = res;
        return this;
    }

    /**
     * Set the http-status-code
     *
     * @param status
     * @returns Response
     */
    status(status: number): Response {
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
    header(type: string, value: string) {
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
    send(content: any) {
        this.content = content;

        if (this.mode === "aws-lambda") {
            // Do nothing ... Store content in variable and use it later ...
        } else {
            if (typeof content === "object" && !Buffer.isBuffer(content)) {
                if (!this.res?.headersSent) {
                    this.res?.setHeader("Content-Type", "application/json");
                }
                this.res?.write(JSON.stringify(content));
            } else {
                this.res?.write(content);
            }
        }
        return this;
    }

    async download(filepath: string, options?: any) {
        return new Promise((resolve: Function, reject: Function) => {
            if (!this.res) {
                return reject("Cannot download: Original response object is missing");
            }

            if (!fs.existsSync(filepath)) {
                return reject("Cannot download: File '" + filepath + "' does not exist");
            }

            let mimeType = options && options.contentType ? options.contentType : "application/octet-stream";
            if (options && options.inline) {
                let tempMime = mime.lookup(filepath);
                if (tempMime) {
                    mimeType = tempMime;
                }
            }

            const stats = fs.lstatSync(filepath);
            this.header(
                "Content-Disposition",
                (options && options.inline ? "inline" : "attachment") +
                    "; filename=" +
                    (options && options.filename ? options.filename : path.basename(filepath))
            );
            this.header("Content-Type", mimeType);
            this.header("Content-Length", stats.size.toString());

            const readStream = fs.createReadStream(filepath);
            readStream.pipe(this.res);

            readStream.on("close", () => {
                resolve();
            });

            readStream.on("error", (streamErr) => {
                console.error(streamErr);
                reject(streamErr);
            });
        });
    }

    end() {
        this.res?.end();
        return this;
    }

    async registerEvent(eventKey: string, func: any) {
        this.events[eventKey].push({ function: func });
    }

    /**
     * Runs the registered events for an event-type
     *
     * @param eventKey
     * @param req
     * @param payload
     */
    async handleEvents(eventKey: string, req: any, payload: any) {
        if (!this.events || !this.events[eventKey] || this.events[eventKey].length < 1) {
            return;
        }

        for (let i in this.events[eventKey]) {
            if (this.events[eventKey][i].function && typeof this.events[eventKey][i].function === "function") {
                this.events[eventKey][i].function(req, payload);
            }
        }
    }
}
