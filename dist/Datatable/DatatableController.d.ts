import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
export declare class DatatableController extends Controller {
    restApi(req: Request, res: Response): Promise<Response>;
    tableExport(req: Request, res: Response): Promise<Response>;
}
