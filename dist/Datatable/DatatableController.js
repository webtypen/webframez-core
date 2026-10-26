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
exports.DatatableController = void 0;
const Controller_1 = require("../Controller/Controller");
const DatatableRegistry_1 = require("./DatatableRegistry");
class DatatableController extends Controller_1.Controller {
    getTableClass(req) {
        return DatatableRegistry_1.DatatableRegistry.getTable(req.body._table);
    }
    configureTable(table, req) { }
    restApi(req, res) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a._table) !== "string" || req.body._table.trim() === "") {
                return res.status(404).send({
                    status: "error",
                    message: "Missing table-key ...",
                });
            }
            const tableClass = this.getTableClass(req);
            if (!tableClass) {
                return res.status(404).send({
                    status: "error",
                    message: "Table '" + req.body._table + "' not found ...",
                });
            }
            if (req.body.export)
                return this.tableExport(req, res);
            const table = new tableClass();
            yield this.configureTable(table, req);
            if (req.body.init_request || req.body.mode === "columns-get") {
                return res.send({ status: "success", data: yield table.getInit(req) });
            }
            if (["columns-save", "columns-reset", "columns-options"].includes(req.body.mode)) {
                try {
                    const data = req.body.mode === "columns-options"
                        ? yield table.getColumnDisplayOptions(req, req.body.column)
                        : req.body.mode === "columns-save"
                            ? yield table.saveColumnPreferences(req, req.body.columns)
                            : yield table.resetColumnPreferences(req);
                    return res.send({ status: "success", data });
                }
                catch (error) {
                    const status = error === null || error === void 0 ? void 0 : error.status;
                    if (status !== 400 && status !== 403)
                        throw error;
                    return res.status(status).send({ status: "error", message: error.message });
                }
            }
            if (req.body.mode === "model-selector-preview") {
                if (!table.getModelSelectorConfig()) {
                    return res.status(403).send({
                        status: "error",
                        message: "Datatable is not enabled for model selection.",
                    });
                }
                return res.send({
                    status: "success",
                    data: yield table.getModelSelectorPreview(req),
                });
            }
            if (req.body.type === "stats" || req.body.mode === "stats") {
                return res.send({
                    status: "success",
                    data: yield table.stats(req),
                });
            }
            if (req.body.apiFunction && typeof req.body.apiFunction === "string" && req.body.apiFunction.trim() !== "") {
                const func = (_b = table.selectableFunctions) === null || _b === void 0 ? void 0 : _b[req.body.apiFunction];
                if (!func || !func.handle) {
                    return res.status(404).send({
                        status: "error",
                        message: "Unknown api-function ...",
                    });
                }
                if (func.isAvailable) {
                    try {
                        const available = yield func.isAvailable(req);
                        if (!available) {
                            return res.status(403).send({
                                status: "error",
                                message: "Api-function not available ...",
                            });
                        }
                    }
                    catch (e) {
                        return res.status(403).send({
                            status: "error",
                            message: e instanceof Error ? e.message : "Api-function not available ...",
                        });
                    }
                }
                try {
                    yield func.handle(req, res);
                }
                catch (e) {
                    console.error(e);
                    return res.status(500).send({
                        status: "error",
                        message: e instanceof Error ? e.message : "Unknown error ...",
                    });
                }
                if (res.content !== undefined || ((_c = res.res) === null || _c === void 0 ? void 0 : _c.headersSent) || res.headersSent || res.writableEnded)
                    return;
                return res.send({
                    status: "success",
                });
            }
            return res.send({
                status: "success",
                data: yield table.getData(req, yield table.getColumnContext(req)),
            });
        });
    }
    tableExport(req, res) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a._table) !== "string" || req.body._table.trim() === "") {
                return res.status(404).send({
                    status: "error",
                    message: "Missing table-key ...",
                });
            }
            const tableClass = this.getTableClass(req);
            if (!tableClass) {
                return res.status(404).send({
                    status: "error",
                    message: "Table '" + req.body._table + "' not found ...",
                });
            }
            const table = new tableClass();
            yield this.configureTable(table, req);
            if (!req.body.export || !table.exports || (table.exports && !table.exports[req.body.export])) {
                return res.status(404).send({
                    status: "error",
                    message: "Unknown export-type ...",
                });
            }
            const exp = table.exports[req.body.export];
            const cols = [];
            const colsData = yield table.getVisibleColumns(req);
            if (colsData && Object.keys(colsData).length > 0) {
                for (let i in colsData) {
                    cols.push(Object.assign(Object.assign({}, colsData[i]), { key: i }));
                }
            }
            const entries = yield table.getTotalData(req);
            const exportData = yield exp.generate(entries, cols, req);
            const base64 = Buffer.from("\uFEFF" + exportData).toString("base64");
            return res.send({
                status: "success",
                data: {
                    filename: exp.filename ? (typeof exp.filename === "function" ? yield exp.filename(req) : exp.filename) : "Export",
                    base64: (exp.contentType ? exp.contentType + ";base64," : "") + base64,
                },
            });
        });
    }
}
exports.DatatableController = DatatableController;
