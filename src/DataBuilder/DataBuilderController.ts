import { Controller } from "../Controller/Controller";
import { serveDataBuilder } from "./DataBuilderRoute";
import { Request } from "../Router/Request";
import { Response } from "../Router/Response";
import { DataBuilder } from "./DataBuilder";

export class DataBuilderController extends Controller {
    builder: DataBuilder;

    constructor(builder?: DataBuilder) {
        super();
        this.builder = builder ? builder : new DataBuilder();
    }

    async restApi(req: Request, res: Response) {
        return serveDataBuilder(this.builder, req, res);
    }
}
