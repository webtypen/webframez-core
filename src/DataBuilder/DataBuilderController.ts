import { Controller } from "../Controller/Controller";
import { DBConnection } from "../Database/DBConnection";
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
        const db = await DBConnection.getConnection();
        if (req.body.__builder_rest_api === "api-autocomplete") {
            return res.send(await this.builder.apiAutoComplete(req));
        } else if (req.body.__builder_rest_api === "details") {
            return res.send(await this.builder.details(db.client.db(null), req));
        } else if (req.body.__builder_rest_api === "details-newdata") {
            return res.send(await this.builder.detailsNewData(db.client.db(null), req));
        } else if (req.body.__builder_rest_api === "save") {
            return res.send(await this.builder.save(db.client.db(null), req));
        } else if (req.body.__builder_rest_api === "type") {
            return res.send(await this.builder.loadType(req));
        }

        return res.status(404).send({
            status: "error",
            message: "Api-Endpoint not found ...",
        });
    }
}
