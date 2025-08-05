import { BaseQueueJob } from "../../src/Queue/BaseQueueJob";

export class TestJob extends BaseQueueJob {
    static title = "TestJob";

    async handle(job: any) {
        this.log("TestJob");
        await this.wait(2500);
        this.log("job finished");
    }
}
