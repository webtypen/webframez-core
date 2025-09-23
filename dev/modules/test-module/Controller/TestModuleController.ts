import { Request } from "../../../../src/Router/Request";
import { Response } from "../../../../src/Router/Response";

export class TestModuleController {
    async test(req: Request, res: Response) {
        res.send({ status: "success", message: "TestModuleController looks great ..." });
    }
}
