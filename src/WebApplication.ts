import { Auth } from "./Auth/Auth";
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
import { ApiScopeRegistry } from "./Api/ApiScopeRegistry";
import { NotificationService } from "./Notifications/NotificationService";
import type { WebServerExtension } from "./Http/WebServerExtension";
// import { SigNozTelemetry } from "./Telemetry/SigNozTelemetry";

export class WebApplication {
    private server!: Server;
    modulesLoader: ModulesLoader | null = null;
    private serverExtensions: WebServerExtension[] = [];
    private closing: Promise<void> | null = null;

    /** Close optional transports before waiting for the HTTP server to stop. */
    close(): Promise<void> {
        if (this.closing) return this.closing;

        this.closing = (async () => {
            let failure: unknown;
            for (const extension of this.serverExtensions.splice(0).reverse()) {
                try { await extension.close(); }
                catch (error) { failure = failure || error; }
            }

            if (this.server) {
                await new Promise<void>((resolve, reject) => this.server.close((error?: Error) => {
                    if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
                    else resolve();
                }));
            }

            if (failure) throw failure;
        })();
        return this.closing;
    }

    /**
     * Init the routes and start the http-server
     */
    boot(options?: any) {
        return ErrorHandler.withContext({ applicationType: "WebApplication", scope: "boot" }, () => {
            try { return this.bootScoped(options); }
            catch (error) { void ErrorHandler.report(error, { scope: "boot", source: "application.boot" }); throw error; }
        });
    }

    private bootScoped(options?: any) {
        if (this.server || this.closing) throw new Error("WebApplication instances can only boot once.");
        const extensions: WebServerExtension[] = options?.extensions || [];
        if (!Array.isArray(extensions) || extensions.some(extension =>
            !extension || typeof extension.attach !== "function" || typeof extension.close !== "function")) {
            throw new Error("WebApplication extensions must implement attach(context) and close().");
        }

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
        Auth.init();
        NotificationService.init();

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
        NotificationService.registerTypes(this.modulesLoader.getNotifications());

        if (options && options.kernel) {
            this.modulesLoader.loadKernel(options.kernel);
        }

        Router.init({
            mode: options && options.mode ? options.mode : null,
            kernel: options && options.kernel ? options.kernel : null,
            basename: options?.basename,
            routesFunction: options && options.routesFunction ? options.routesFunction : null,
            tempDir: options && options.tempDir ? options.tempDir : null,
        });

        this.modulesLoader.initRoutes();
        ApiScopeRegistry.register({
            kernel: options && options.kernel ? options.kernel : null,
            modulesLoader: this.modulesLoader,
        });

        if (options && options.datatables) {
            DatatableRegistry.registerMany(options.datatables);
        }

        if (options.jobs && options.jobs.length > 0) {
            QueueJobsRegisty.registerJob(options.jobs);
        }

        const port = options?.port !== undefined ? options.port : 3000;
        this.server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => ErrorHandler.withContext({ applicationType: "WebApplication", scope: "controller", operationId: WebframezHooks.createOperationId("http") }, async () => {
            try {
                const handled = await HttpKernelHandlerRegistry.handle({
                    req,
                    res,
                    kernel: options && options.kernel ? options.kernel : null,
                    modulesLoader: this.modulesLoader,
                    basename: Router.basename,
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
        }));

        this.server.on("error", (error) => {
            void this.close().catch(closeError => ErrorHandler.report(closeError, { source: "http.server.close" }));
            void ErrorHandler.report(error, { applicationType: "WebApplication", scope: "boot", source: "http.server" });
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

        try {
            for (const extension of extensions) {
                this.serverExtensions.push(extension);
                extension.attach({ server: this.server, basename: Router.basename,
                    kernel: options?.kernel || null, modulesLoader: this.modulesLoader });
            }
        } catch (error) {
            void this.close().catch(closeError => ErrorHandler.report(closeError, { source: "http.server.close" }));
            throw error;
        }

        try {
            this.server.listen(port, () => {
                const address = this.server.address();
                const listeningPort = address && typeof address === "object" ? address.port : port;
                void WebframezHooks.emit("app.boot.end", {
                    operationId: bootOperationId,
                    name: "web",
                    status: "ok",
                    attributes: {
                        "server.port": listeningPort,
                        "webframez.mode": options && options.mode ? options.mode : "web",
                    },
                });

                const runtimeConsole = typeof globalThis !== "undefined" ? (globalThis as any).console : undefined;
                if (runtimeConsole && typeof runtimeConsole.log === "function") {
                    runtimeConsole.log(
                        "Server started and listening on port " +
                            listeningPort +
                            (Router.basename ? " (Basename: " + Router.basename + ")" : "")
                    );
                }

                if (options && options.onBoot) {
                    options.onBoot(listeningPort);
                }
            });
        } catch (error) {
            void this.close().catch(closeError => ErrorHandler.report(closeError, { source: "http.server.close" }));
            throw error;
        }
        return this.server;
    }
}
