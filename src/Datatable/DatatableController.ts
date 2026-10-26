import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { Datatable } from "./Datatable";
import { DatatableRegistry } from "./DatatableRegistry";

export class DatatableController extends Controller {
    protected getTableClass(req: Request) {
        return DatatableRegistry.getTable(req.body._table);
    }

    protected configureTable(table: Datatable, req: Request): void | Promise<void> {}

    async restApi(req: Request, res: Response) {
        if (typeof req.body?._table !== "string" || req.body._table.trim() === "") {
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

        if (req.body.export) return this.tableExport(req, res);
        const table = new tableClass();
        await this.configureTable(table, req);
        if (req.body.init_request || req.body.mode === "columns-get") {
            return res.send({ status: "success", data: await table.getInit(req) });
        }
        if (["columns-save", "columns-reset", "columns-options"].includes(req.body.mode)) {
            try {
                const data = req.body.mode === "columns-options"
                    ? await table.getColumnDisplayOptions(req, req.body.column)
                    : req.body.mode === "columns-save"
                    ? await table.saveColumnPreferences(req, req.body.columns)
                    : await table.resetColumnPreferences(req);
                return res.send({ status: "success", data });
            } catch (error) {
                const status = (error as any)?.status;
                if (status !== 400 && status !== 403) throw error;
                return res.status(status).send({ status: "error", message: (error as Error).message });
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
                data: await table.getModelSelectorPreview(req),
            });
        }

        if (req.body.type === "stats" || req.body.mode === "stats") {
            return res.send({
                status: "success",
                data: await table.stats(req),
            });
        }

        if (req.body.apiFunction && typeof req.body.apiFunction === "string" && req.body.apiFunction.trim() !== "") {
            const func = table.selectableFunctions?.[req.body.apiFunction];
            if (!func || !func.handle) {
                return res.status(404).send({
                    status: "error",
                    message: "Unknown api-function ...",
                });
            }

            if (func.isAvailable) {
                try {
                    const available = await func.isAvailable(req);
                    if (!available) {
                        return res.status(403).send({
                            status: "error",
                            message: "Api-function not available ...",
                        });
                    }
                } catch (e) {
                    return res.status(403).send({
                        status: "error",
                        message: e instanceof Error ? e.message : "Api-function not available ...",
                    });
                }
            }

            try {
                await func.handle(req, res);
            } catch (e) {
                console.error(e);

                return res.status(500).send({
                    status: "error",
                    message: e instanceof Error ? e.message : "Unknown error ...",
                });
            }

            if (res.content !== undefined || res.res?.headersSent || (res as any).headersSent || (res as any).writableEnded) return;
            return res.send({
                status: "success",
            });
        }

        return res.send({
            status: "success",
            data: await table.getData(req, await table.getColumnContext(req)),
        });
    }

    async tableExport(req: Request, res: Response) {
        if (typeof req.body?._table !== "string" || req.body._table.trim() === "") {
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
        await this.configureTable(table, req);
        if (!req.body.export || !table.exports || (table.exports && !table.exports[req.body.export])) {
            return res.status(404).send({
                status: "error",
                message: "Unknown export-type ...",
            });
        }

        const exp = table.exports[req.body.export];
        const cols: any = [];
        const colsData = await table.getVisibleColumns(req);
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
