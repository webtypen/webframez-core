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
    restApi(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!req.body._table || req.body._table.trim() === "") {
                return res.status(404).send({
                    status: "error",
                    message: "Missing table-key ...",
                });
            }
            const tableClass = DatatableRegistry_1.DatatableRegistry.getTable(req.body._table);
            if (!tableClass) {
                return res.status(404).send({
                    status: "error",
                    message: "Table '" + req.body._table + "' not found ...",
                });
            }
            if (req.body.init_request) {
                const table = new tableClass();
                return res.send({
                    status: "success",
                    data: yield table.getInit(req),
                });
            }
            if (!req.body._table || req.body._table.trim() === "") {
                return res.status(404).send({
                    status: "error",
                    message: "Missing table-key ...",
                });
            }
            const table = new tableClass();
            return res.send({
                status: "success",
                data: yield table.getData(req),
            });
        });
    }
    tableExport(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!req.body._table || req.body._table.trim() === "") {
                return res.status(404).send({
                    status: "error",
                    message: "Missing table-key ...",
                });
            }
            const tableClass = DatatableRegistry_1.DatatableRegistry.getTable(req.body._table);
            if (!tableClass) {
                return res.status(404).send({
                    status: "error",
                    message: "Table '" + req.body._table + "' not found ...",
                });
            }
            const table = new tableClass();
            if (!req.body.export || !table.exports || (table.exports && !table.exports[req.body.export])) {
                return res.status(404).send({
                    status: "error",
                    message: "Unknown export-type ...",
                });
            }
            const exp = table.exports[req.body.export];
            const cols = [];
            const colsData = yield table.getColumns(req);
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
