"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebApplication = void 0;
const http_1 = __importDefault(require("http"));
const Config_1 = require("./Config");
const Router_1 = require("./Router/Router");
class WebApplication {
    /**
     * Init the routes and start the http-server
     */
    boot(options) {
        if (options && options.config) {
            for (let key in options.config) {
                Config_1.Config.register(key, options.config[key]);
            }
        }
        Router_1.Router.init({
            mode: options && options.mode ? options.mode : null,
            kernel: options && options.kernel ? options.kernel : null,
            basename: options && options.basename ? options.basename : null,
            routesFunction: options && options.routesFunction ? options.routesFunction : null,
            tempDir: options && options.tempDir ? options.tempDir : null,
        });
        const port = options && options.port ? options.port : 3000;
        this.server = http_1.default.createServer((req, res) => {
            Router_1.Router.handleRequest(req, res);
        });
        this.server.listen(port, () => {
            console.log("Server started and listening on port " +
                port +
                (options && options.basename ? " (Basename: " + options && options.basename + ")" : ""));
            if (options && options.onBoot) {
                options.onBoot(port);
            }
        });
        return this.server;
    }
}
exports.WebApplication = WebApplication;
