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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LambdaApplication = void 0;
const Auth_1 = require("./Auth/Auth");
const Config_1 = require("./Config");
const DatatableRegistry_1 = require("./Datatable/DatatableRegistry");
const QueueJobsRegisty_1 = require("./Queue/QueueJobsRegisty");
const Router_1 = require("./Router/Router");
const ErrorHandler_1 = require("./ErrorHandling/ErrorHandler");
const WebframezHooks_1 = require("./Hooks/WebframezHooks");
class LambdaApplication {
    /**
     * Init the routes and handle the request
     */
    boot(event, context, options) {
        return ErrorHandler_1.ErrorHandler.withContext({ applicationType: "LambdaApplication", scope: "boot" }, () => {
            try {
                return this.bootScoped(event, context, options);
            }
            catch (error) {
                void ErrorHandler_1.ErrorHandler.report(error, { source: "lambda.boot" });
                throw error;
            }
        });
    }
    bootScoped(event, context, options) {
        const operationId = WebframezHooks_1.WebframezHooks.createOperationId("lambda");
        void WebframezHooks_1.WebframezHooks.emit("lambda.invoke.start", {
            operationId,
            name: "aws-lambda",
            attributes: {
                "faas.trigger": "http",
                "webframez.mode": "aws-lambda",
            },
        });
        if (options && options.config) {
            for (let key in options.config) {
                Config_1.Config.register(key, options.config[key]);
            }
        }
        Auth_1.Auth.init();
        if (options && options.errorHandler) {
            if (Array.isArray(options.errorHandler)) {
                ErrorHandler_1.ErrorHandler.setHandlers(options.errorHandler);
            }
            else {
                ErrorHandler_1.ErrorHandler.setHandler(options.errorHandler);
            }
        }
        Router_1.Router.init({
            mode: "aws-lambda",
            kernel: options && options.kernel ? options.kernel : null,
            basename: options === null || options === void 0 ? void 0 : options.basename,
            routesFunction: options && options.routesFunction ? options.routesFunction : null,
            tempDir: options && options.tempDir ? options.tempDir : null,
        });
        if (options && options.datatables) {
            DatatableRegistry_1.DatatableRegistry.registerMany(options.datatables);
        }
        if (options.jobs && options.jobs.length > 0) {
            QueueJobsRegisty_1.QueueJobsRegisty.registerJob(options.jobs);
        }
        return Promise.resolve(Router_1.Router.handleRequest(null, null, { event: event }))
            .then((result) => {
            void WebframezHooks_1.WebframezHooks.emit("lambda.invoke.end", {
                operationId,
                name: "aws-lambda",
                status: "ok",
                attributes: {
                    "faas.trigger": "http",
                    "webframez.mode": "aws-lambda",
                },
            });
            return result;
        })
            .catch((error) => __awaiter(this, void 0, void 0, function* () {
            yield ErrorHandler_1.ErrorHandler.report(error, { scope: "controller", source: "lambda.invoke" });
            void WebframezHooks_1.WebframezHooks.emit("lambda.invoke.error", {
                operationId,
                name: "aws-lambda",
                status: "error",
                error,
                attributes: {
                    "faas.trigger": "http",
                    "webframez.mode": "aws-lambda",
                },
            });
            throw error;
        }));
    }
}
exports.LambdaApplication = LambdaApplication;
