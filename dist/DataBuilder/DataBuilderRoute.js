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
exports.dataBuilderRoute = exports.serveDataBuilder = void 0;
const DBConnection_1 = require("../Database/DBConnection");
const DataBuilder_1 = require("./DataBuilder");
/** Shared v1 wire protocol for the router helper and existing controllers. */
function serveDataBuilder(builder, req, res, connection) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        switch ((_a = req.body) === null || _a === void 0 ? void 0 : _a.__builder_rest_api) {
            case "type":
                return res.send(yield builder.loadType(req));
            case "api-autocomplete":
                return res.send(yield builder.apiAutoComplete(req));
            case "details":
                return res.send(yield builder.details(yield DBConnection_1.DBConnection.getDocumentStore(connection), req));
            case "details-newdata":
                return res.send(yield builder.detailsNewData(yield DBConnection_1.DBConnection.getDocumentStore(connection), req));
            case "save":
                return res.send(yield builder.save(yield DBConnection_1.DBConnection.getDocumentStore(connection), req));
            case "delete":
                return res.send(yield builder.delete(yield DBConnection_1.DBConnection.getDocumentStore(connection), req));
            default:
                return res.status(404).send({ status: "error", message: "Api-Endpoint not found ..." });
        }
    });
}
exports.serveDataBuilder = serveDataBuilder;
function dataBuilderRoute(options = {}) {
    return (req, res) => __awaiter(this, void 0, void 0, function* () {
        const builder = new DataBuilder_1.DataBuilder(options.connection);
        if (Array.isArray(options.fieldTypes)) {
            for (const field of options.fieldTypes)
                builder.registerFieldType(field);
        }
        else {
            for (const [key, field] of Object.entries(options.fieldTypes || {})) {
                builder.registerFieldType(key, typeof field === "function" ? new field() : field);
            }
        }
        for (const rule of options.validationTypes || [])
            builder.registerValidationType(rule);
        for (const [key, model] of Object.entries(options.models || {}))
            builder.registerModelType(key, model);
        for (const type of options.types || [])
            builder.registerType(type);
        if (options.configure)
            yield options.configure(builder, req);
        return serveDataBuilder(builder, req, res, options.connection);
    });
}
exports.dataBuilderRoute = dataBuilderRoute;
