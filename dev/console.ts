import dotenv from "dotenv";
import { ConsoleApplication } from "../src/ConsoleApplication";
import { BaseKernelConsole } from "../src/BaseKernelConsole";
import { DBDrivers } from "../src/Database/DBDrivers";
import { DBConnection } from "../src/Database/DBConnection";
import { MongoDBDriver } from "./MongoDBDriver";
import { TestCommand } from "./commands/TestCommand";

dotenv.config();

import database from "./config/database";
import queue from "./config/queue";
import { TestJob } from "./jobs/TestJob";

class KernelConsole extends BaseKernelConsole {
    static commands: any = [TestCommand];
}

const QUEUE_JOBS: any[] = [TestJob];

DBDrivers.register("mongodb", MongoDBDriver);
const app = new ConsoleApplication();
app.boot({
    kernel: KernelConsole,
    config: {
        application: {},
        database: database,
        queue: queue,
    },
    jobs: QUEUE_JOBS,
    onEnd: async () => {
        const connection = await DBConnection.getConnection();
        if (connection && connection.client) {
            connection.driver.close(connection.client);
        }
    },
});
