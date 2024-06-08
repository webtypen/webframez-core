"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LambdaApplication = void 0;
const Config_1 = require("./Config");
const Router_1 = require("./Router/Router");
class LambdaApplication {
    /**
     * Init the routes and handle the request
     */
    boot(event, context, options) {
        if (options && options.config) {
            for (let key in options.config) {
                Config_1.Config.register(key, options.config[key]);
            }
        }
        Router_1.Router.init({
            mode: "aws-lambda",
            kernel: options && options.kernel ? options.kernel : null,
            basename: options && options.basename ? options.basename : null,
        });
        return Router_1.Router.handleRequest(null, null, { event: event });
    }
}
exports.LambdaApplication = LambdaApplication;
