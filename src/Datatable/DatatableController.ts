import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { DatatableRegistry } from "./DatatableRegistry";

export class DatatableController extends Controller {
    async restApi(req: Request, res: Response) {
        if (!req.body._table || req.body._table.trim() === "") {
            return res.status(404).send({
                status: "error",
                message: "Missing table-key ...",
            });
        }

        const tableClass = DatatableRegistry.getTable(req.body._table);
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
                data: await table.getInit(req),
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
            data: await table.getData(req),
        });
    }

    async tableExport(req: Request, res: Response) {
        if (!req.body._table || req.body._table.trim() === "") {
            return res.status(404).send({
                status: "error",
                message: "Missing table-key ...",
            });
        }

        const tableClass = DatatableRegistry.getTable(req.body._table);
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
        const cols: any = [];
        const colsData = await table.getColumns(req);
        if (colsData && Object.keys(colsData).length > 0) {
            for (let i in colsData) {
                cols.push({ ...colsData[i], key: i });
            }
        }

        const entries = await table.getTotalData(req);
        const exportData = await exp.generate(entries, cols, req);
        const base64 = Buffer.from("\uFEFF" + exportData).toString("base64");

        return res.send({
            status: "success",
            data: {
                filename: exp.filename ? (typeof exp.filename === "function" ? await exp.filename(req) : exp.filename) : "Export",
                base64: (exp.contentType ? exp.contentType + ";base64," : "") + base64,
            },
        });
    }
}
