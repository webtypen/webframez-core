import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { Datatable } from "./Datatable";
export declare class DatatableController extends Controller {
    protected getTableClass(req: Request): any;
    protected configureTable(table: Datatable, req: Request): void | Promise<void>;
    restApi(req: Request, res: Response): Promise<Response | undefined>;
    tableExport(req: Request, res: Response): Promise<Response>;
}
