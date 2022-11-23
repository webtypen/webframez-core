"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebApplication = void 0;
const http_1 = __importDefault(require("http"));
const Router_1 = require("./Router/Router");
class WebApplication {
    /**
     * Init the routes and start the http-server
     */
    boot() {
        Router_1.Router.init();
        this.server = http_1.default
            .createServer((req, res) => {
            Router_1.Router.handleRequest(req, res);
        })
            .listen(3000, () => {
            console.log("Server started and listening on port 3000");
        });
    }
}
exports.WebApplication = WebApplication;
