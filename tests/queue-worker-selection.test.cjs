const test = require("node:test");
const assert = require("node:assert/strict");
const { QueueWorkerCommand } = require("../dist/Commands/QueueWorkerCommand");
const { Config } = require("../dist");

test("dedicated workers can exclude implicit backups without changing legacy defaults", t => {
    t.mock.method(Config, "get", key => key === "backup" ? {} : undefined);
    const worker = new QueueWorkerCommand({ arguments: [], options: {} });
    const classes = ["AiRunResumeJob"];
    worker.workerConfig = { jobclasses: classes, includeBackupJobs: false };
    assert.deepEqual(worker.getWorkerJobclasses(), classes);
    worker.workerConfig = { jobclasses: classes };
    assert.deepEqual(worker.getWorkerJobclasses(), ["AiRunResumeJob", "BackupRunJob"]);
    assert.deepEqual(classes, ["AiRunResumeJob"]);
    worker.workerConfig = { jobclasses: ["BackupRunJob"], includeBackupJobs: false };
    assert.deepEqual(worker.getWorkerJobclasses(), ["BackupRunJob"]);
});
