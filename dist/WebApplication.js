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
exports.WebApplication = void 0;
/// <reference types="node" />
const http_1 = __importDefault(require("http"));
const Config_1 = require("./Config");
const Router_1 = require("./Router/Router");
const QueueJobsRegisty_1 = require("./Queue/QueueJobsRegisty");
const DatatableRegistry_1 = require("./Datatable/DatatableRegistry");
const ModulesLoader_1 = require("./Modules/ModulesLoader");
const ErrorHandler_1 = require("./ErrorHandling/ErrorHandler");
const WebframezHooks_1 = require("./Hooks/WebframezHooks");
const HttpKernelHandlerRegistry_1 = require("./Http/HttpKernelHandlerRegistry");
// import { SigNozTelemetry } from "./Telemetry/SigNozTelemetry";
class WebApplication {
    constructor() {
        this.modulesLoader = null;
    }
    /**
     * Init the routes and start the http-server
     */
    boot(options) {
        const bootOperationId = WebframezHooks_1.WebframezHooks.createOperationId("app");
        void WebframezHooks_1.WebframezHooks.emit("app.boot.start", {
            operationId: bootOperationId,
            name: "web",
            attributes: {
                "webframez.mode": options && options.mode ? options.mode : "web",
            },
        });
        if (options && options.config) {
            for (let key in options.config) {
                Config_1.Config.register(key, options.config[key]);
            }
        }
        if (options && options.errorHandler) {
            if (Array.isArray(options.errorHandler)) {
                ErrorHandler_1.ErrorHandler.setHandlers(options.errorHandler);
            }
            else {
                ErrorHandler_1.ErrorHandler.setHandler(options.errorHandler);
            }
        }
        // if (options && options.signoz) {
        //     void SigNozTelemetry.init(options.signoz);
        // }
        this.modulesLoader = new ModulesLoader_1.ModulesLoader();
        this.modulesLoader.load(options && options.modules ? options.modules : [], {
            kernel: options && options.kernel ? options.kernel : null,
            options,
        });
        if (options && options.kernel) {
            this.modulesLoader.loadKernel(options.kernel);
        }
        Router_1.Router.init({
            mode: options && options.mode ? options.mode : null,
            kernel: options && options.kernel ? options.kernel : null,
            basename: options && options.basename ? options.basename : null,
            routesFunction: options && options.routesFunction ? options.routesFunction : null,
            tempDir: options && options.tempDir ? options.tempDir : null,
        });
        this.modulesLoader.initRoutes();
        if (options && options.datatables) {
            DatatableRegistry_1.DatatableRegistry.registerMany(options.datatables);
        }
        if (options.jobs && options.jobs.length > 0) {
            QueueJobsRegisty_1.QueueJobsRegisty.registerJob(options.jobs);
        }
        const port = options && options.port ? options.port : 3000;
        this.server = http_1.default.createServer((req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const handled = yield HttpKernelHandlerRegistry_1.HttpKernelHandlerRegistry.handle({
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
                yield Router_1.Router.handleRequest(req, res);
            }
            catch (error) {
                yield ErrorHandler_1.ErrorHandler.report(error, {
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
            void WebframezHooks_1.WebframezHooks.emit("app.boot.error", {
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
            void WebframezHooks_1.WebframezHooks.emit("app.boot.end", {
                operationId: bootOperationId,
                name: "web",
                status: "ok",
                attributes: {
                    "server.port": port,
                    "webframez.mode": options && options.mode ? options.mode : "web",
                },
            });
            const runtimeConsole = typeof globalThis !== "undefined" ? globalThis.console : undefined;
            if (runtimeConsole && typeof runtimeConsole.log === "function") {
                runtimeConsole.log("Server started and listening on port " +
                    port +
                    (options && options.basename ? " (Basename: " + options && options.basename + ")" : ""));
            }
            if (options && options.onBoot) {
                options.onBoot(port);
            }
        });
        return this.server;
    }
}
exports.WebApplication = WebApplication;
