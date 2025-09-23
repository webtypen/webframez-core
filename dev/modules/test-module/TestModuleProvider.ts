import { ModuleProvider } from "../../../src/Modules/ModuleProvider";
import { Request } from "../../../src/Router/Request";
import { Response } from "../../../src/Router/Response";
import { Route } from "../../../src/Router/Route";
import { TestModuleController } from "./Controller/TestModuleController";

export class TestModuleProvider extends ModuleProvider {
    static key = "test-module";

    controller = {
        TestModuleController: TestModuleController,
    };

    routes() {
        Route.group({ middleware: [] }, () => {
            Route.get("/", (req: Request, res: Response) => {
                res.send({
                    module: "TestModule",
                    status: "active",
                });
            });

            Route.get("/testmodule", "TestModuleController@test");
        });
    }

    boot() {
        console.log("On Booot");
    }
}
