"use strict";
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
// import { SigNozTelemetry } from "./Telemetry/SigNozTelemetry";
class WebApplication {
    constructor() {
        this.modulesLoader = null;
    }
    /**
     * Init the routes and start the http-server
     */
    boot(options) {
        if (options && options.config) {
            for (let key in options.config) {
                Config_1.Config.register(key, options.config[key]);
            }
        }
        // if (options && options.signoz) {
        //     void SigNozTelemetry.init(options.signoz);
        // }
        this.modulesLoader = new ModulesLoader_1.ModulesLoader();
        this.modulesLoader.load(options && options.modules ? options.modules : []);
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
        this.server = http_1.default.createServer((req, res) => {
            Router_1.Router.handleRequest(req, res);
        });
        // this.server.on("close", () => {
        //     void SigNozTelemetry.shutdown();
        // });
        this.server.listen(port, () => {
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
