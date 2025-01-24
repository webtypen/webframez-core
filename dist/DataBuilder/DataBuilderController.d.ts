import { Controller } from "../Controller/Controller";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { DataBuilder } from "./DataBuilder";
export declare class DataBuilderController extends Controller {
    builder: DataBuilder;
    constructor(builder?: DataBuilder);
    restApi(req: Request, res: Response): Promise<Response>;
}
