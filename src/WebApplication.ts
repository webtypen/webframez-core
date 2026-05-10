/// <reference types="node" />
import http, { Server } from "http";
import { Config } from "./Config";
import { Router } from "./Router/Router";
import { QueueJobsRegisty } from "./Queue/QueueJobsRegisty";
import { DatatableRegistry } from "./Datatable/DatatableRegistry";
import { ModulesLoader } from "./Modules/ModulesLoader";
import { ErrorHandler } from "./ErrorHandling/ErrorHandler";
import { WebframezHooks } from "./Hooks/WebframezHooks";
import { HttpKernelHandlerRegistry } from "./Http/HttpKernelHandlerRegistry";
// import { SigNozTelemetry } from "./Telemetry/SigNozTelemetry";

export class WebApplication {
    private server!: Server;
    modulesLoader: ModulesLoader | null = null;

    /**
     * Init the routes and start the http-server
     */
    boot(options?: any) {
        const bootOperationId = WebframezHooks.createOperationId("app");
        void WebframezHooks.emit("app.boot.start", {
            operationId: bootOperationId,
            name: "web",
            attributes: {
                "webframez.mode": options && options.mode ? options.mode : "web",
            },
        });

        if (options && options.config) {
            for (let key in options.config) {
                Config.register(key, options.config[key]);
            }
        }

        if (options && options.errorHandler) {
            if (Array.isArray(options.errorHandler)) {
                ErrorHandler.setHandlers(options.errorHandler);
            } else {
                ErrorHandler.setHandler(options.errorHandler);
            }
        }

        // if (options && options.signoz) {
        //     void SigNozTelemetry.init(options.signoz);
        // }

        this.modulesLoader = new ModulesLoader();
        this.modulesLoader.load(options && options.modules ? options.modules : [], {
            kernel: options && options.kernel ? options.kernel : null,
            options,
        });

        if (options && options.kernel) {
            this.modulesLoader.loadKernel(options.kernel);
        }

        Router.init({
            mode: options && options.mode ? options.mode : null,
            kernel: options && options.kernel ? options.kernel : null,
            basename: options && options.basename ? options.basename : null,
            routesFunction: options && options.routesFunction ? options.routesFunction : null,
            tempDir: options && options.tempDir ? options.tempDir : null,
        });

        this.modulesLoader.initRoutes();

        if (options && options.datatables) {
            DatatableRegistry.registerMany(options.datatables);
        }

        if (options.jobs && options.jobs.length > 0) {
            QueueJobsRegisty.registerJob(options.jobs);
        }

        const port = options && options.port ? options.port : 3000;
        this.server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
            try {
                const handled = await HttpKernelHandlerRegistry.handle({
                    req,
                    res,
                    kernel: options && options.kernel ? options.kernel : null,
                    modulesLoader: this.modulesLoader,
                    basename: options && options.basename ? options.basename : null,
                    options,
                });

                if (handled) {
                    return;
                }

                await Router.handleRequest(req, res);
            } catch (error) {
                await ErrorHandler.report(error, {
                    scope: "controller",
                    source: "web.application.httpKernelHandler",
                    controller: {
                        method: req.method || "",
                        url: req.url || "",
                    },
                });

                if (!res.writableEnded) {
                    res.statusCode = 500;
                    res.end("Internal Server Error");
                }
            }
        });

        this.server.on("error", (error) => {
            void WebframezHooks.emit("app.boot.error", {
                operationId: bootOperationId,
                name: "web",
                status: "error",
                error,
                attributes: {
                    "server.port": port,
                    "webframez.mode": options && options.mode ? options.mode : "web",
                },
            });

            if (this.server.listenerCount("error") <= 1) {
                throw error;
            }
        });

        // this.server.on("close", () => {
        //     void SigNozTelemetry.shutdown();
        // });

        this.server.listen(port, () => {
            void WebframezHooks.emit("app.boot.end", {
                operationId: bootOperationId,
                name: "web",
                status: "ok",
                attributes: {
                    "server.port": port,
                    "webframez.mode": options && options.mode ? options.mode : "web",
                },
            });

            const runtimeConsole = typeof globalThis !== "undefined" ? (globalThis as any).console : undefined;
            if (runtimeConsole && typeof runtimeConsole.log === "function") {
                runtimeConsole.log(
                    "Server started and listening on port " +
                        port +
                        (options && options.basename ? " (Basename: " + options && options.basename + ")" : "")
                );
            }

            if (options && options.onBoot) {
                options.onBoot(port);
            }
        });
        return this.server;
    }
}
