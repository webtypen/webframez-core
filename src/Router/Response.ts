import fs from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import mime from "mime-types";
import { ServerResponse } from "http";
import { Request } from "./Request";

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

    /**
     * Sends a CSV file to the client
     *
     * @param content
     * @param filename
     * @param options
     * @returns Response
     */
    async sendCsv(
        content: string | string[][],
        filename = "export.csv",
        options?: { seperator?: string; eol: string; skipUtf8BOM?: boolean; contentType?: string; contentDisposition?: string }
    ) {
        this.header("Content-Type", options && options.contentType ? options.contentType : "text/csv");
        this.header(
            "Content-Disposition",
            (options && options.contentDisposition ? options.contentDisposition : "attachment") +
                ";filename=" +
                (filename ? filename : "export.csv")
        );

        let str = "";
        if (content && typeof content === "string") {
            str = content;
        } else if (content && Array.isArray(content) && content.length > 0) {
            for (let row of content) {
                str +=
                    (str.trim() !== "" ? (options && options.eol ? options.eol : "\n") : "") +
                    row.join(options && options.seperator ? options.seperator : ";");
            }
        }

        return this.send((options && options.skipUtf8BOM ? "" : "\uFEFF") + str);
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
    async stream(req: Request, filepath: string, filename: string, mimeType: string) {
        if (!this.res) throw new Error("Native Response-Objekt nicht verfügbar");
        const stats = await fs.promises.stat(filepath);
        const total = stats.size;
        const range = String(req.headers?.range || req.message?.headers.range || "");
        let start = 0, end = total - 1;
        if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (!match || (!match[1] && !match[2])) {
                return this.status(416).header("Content-Range", `bytes */${total}`).end();
            }
            if (!match[1]) {
                const suffix = Number(match[2]);
                start = Math.max(0, total - suffix);
                if (suffix === 0) start = total;
            } else {
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
        if (total === 0) return this.end();
        await pipeline(fs.createReadStream(filepath, {start, end}), this.res);
    }

    async download(filepath: string, options?: any) {
        if (!this.res) throw new Error("Cannot download: Original response object is missing");
        const stats = await fs.promises.stat(filepath);
        const mimeType = options?.contentType || (options?.inline && mime.lookup(filepath)) || "application/octet-stream";
        const filename = String(options?.filename || path.basename(filepath)).replace(/["\r\n\\]/g, "_");
        this.header("Content-Disposition", `${options?.inline ? "inline" : "attachment"}; filename="${filename}"`);
        this.header("Content-Type", mimeType);
        this.header("Content-Length", String(stats.size));
        await pipeline(fs.createReadStream(filepath), this.res);
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
