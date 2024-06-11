import fs from "fs";
import path from "path";
import Busboy from "busboy";
import { WebApplication } from "../src/WebApplication";
import { BaseKernelWeb } from "../src/BaseKernelWeb";
import { Route } from "../src/Router/Route";
import { Request } from "../src/Router/Request";
import { Response } from "../src/Router/Response";

class Kernel extends BaseKernelWeb {
    static controller: { [key: string]: any } = {};
    static middleware: { [key: string]: any } = {};
}

const app = new WebApplication();
app.boot({
    kernel: Kernel,
    config: {
        application: {},
        database: {},
    },
    port: process.env.PORT ? process.env.PORT : 3000,
    basename: process.env.BASENAME ? process.env.BASENAME : null,
    routesFunction: () => {
        Route.group({ prefix: "/main", middleware: [] }, () => {
            Route.group({ prefix: "/test", middleware: [] }, () => {
                Route.get("/:test/details", (req: Request, res: Response) => {
                    res.send({
                        status: "success",
                    });
                });
            });
        });

        Route.get("/download", async (req: Request, res: Response) => {
            const file = path.join(__dirname, "uploads", "2024-06-09_test.zip");
            return await res.download(file);
        });

        Route.post("/fileupload", (req: Request, res: Response) => {
            if (!req.message) {
                throw Error("Missing IncomingMessage ...");
            }

            const busboy = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB Limit
            busboy.on("file", (fieldname: any, file: any, options: any) => {
                console.log(`Uploading:`, options);

                const saveTo = path.join(__dirname, "uploads", options.filename);
                file.pipe(fs.createWriteStream(saveTo));

                file.on("data", (data: any) => {
                    console.log(`Received ${data.length} bytes for ${options.filename}`);
                });

                file.on("end", () => {
                    console.log(`${options.filename} upload complete.`);
                });

                file.on("error", (err: any) => {
                    console.error(`Error uploading ${options.filename}:`, err);
                });
            });

            busboy.on("finish", () => {
                console.log("Upload complete.");
            });

            busboy.on("error", (err: any) => {
                console.error("Error occurred during file upload:", err);
            });

            req.message.pipe(busboy); // Verwendet das native req-Objekt
        });
    },
});

function getBoundary(contentType: string) {
    const match = contentType.match(/boundary=(.+)$/);
    return match ? `--${match[1]}` : null;
}

function parseHeaders(headerPart: string) {
    const headers: { [key: string]: string } = {};
    const lines = headerPart.split("\r\n");
    lines.forEach((line) => {
        const parts = line.split(":");
        if (parts.length === 2) {
            headers[parts[0].trim()] = parts[1].trim();
        }
    });
    return headers;
}

function getFilename(contentDisposition: string) {
    const match = contentDisposition.match(/filename="(.+?)"/);
    return match ? match[1] : null;
}
