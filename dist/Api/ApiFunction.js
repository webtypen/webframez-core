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
exports.ApiFunction = exports.ApiFunctionResponse = void 0;
class ApiFunctionResponse {
    getData() {
        return this.data;
    }
    constructor(data, options) {
        var _a, _b;
        this.data = {};
        this.status = 200;
        this.responseType = "response";
        this.data = data;
        this.status = (_a = options === null || options === void 0 ? void 0 : options.status) !== null && _a !== void 0 ? _a : 200;
        this.responseType = (_b = options === null || options === void 0 ? void 0 : options.responseType) !== null && _b !== void 0 ? _b : "response";
    }
}
exports.ApiFunctionResponse = ApiFunctionResponse;
class ApiFunction {
    constructor() {
        this.key = "unnamed-function";
        this.description = "A unnamed example function";
        this.requestMethod = "POST";
        this.mcpDisabled = false;
        this.params = {
            elementId: { type: "ObjectId", required: true },
            mode: { type: "option", options: [{ value: "all" }, { value: "pending" }], default: "all" },
        };
    }
    handle(apiRequest) {
        return __awaiter(this, void 0, void 0, function* () {
            return new ApiFunctionResponse({ status: "Api is running ..." });
        });
    }
}
exports.ApiFunction = ApiFunction;
