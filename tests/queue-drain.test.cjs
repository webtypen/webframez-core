const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { QueueWorkerCommand } = require("../dist/Commands/QueueWorkerCommand");
const { Config, DBConnection } = require("../dist");

function worker(t, collection) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "queue-drain-"));
    const previous = { ...process.env };
    process.env.STORAGE_DIR = dir;
    process.env.WEBFRAMEZ_QUEUE_STATE_FILE = path.join(dir, "state.json");
    process.env.WEBFRAMEZ_QUEUE_INSTANCE = "instance-a";
    t.after(() => { for (const key of ["STORAGE_DIR", "WEBFRAMEZ_QUEUE_STATE_FILE", "WEBFRAMEZ_QUEUE_INSTANCE"]) {
        if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    } fs.rmSync(dir, { recursive: true, force: true }); });
    t.mock.method(Config, "get", () => ({ is_active: true }));
    t.mock.method(DBConnection, "getConnection", async () => ({}));
    t.mock.method(DBConnection, "documentStore", () => ({ collection: () => collection }));
    const command = new QueueWorkerCommand({ arguments: [], options: { worker: "default" } });
    command.log = () => {};
    command.logRegisteredAutomation = () => {};
    command.getWorkerJobclasses = () => null;
    command.runAutomation = async () => {};
    return { command, state: () => JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8")) };
}

test("SIGTERM drains the current job and never claims a second job", async t => {
    let finishJob, started, claims = 0;
    const jobStarted = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { finishJob = resolve; });
    const updates = [];
    const { command, state } = worker(t, {
        findOneAndUpdate: async () => { claims++; return { _id: "job-1", number: 1, jobclass: "SlowJob" }; },
        updateOne: async (...args) => { updates.push(args); },
    });
    command.jobTypes.SlowJob = class { async handle() { started(); await gate; } getLog() { return []; } };
    const before = process.listenerCount("SIGTERM");
    const run = command.handle();
    await jobStarted;
    process.emit("SIGTERM");
    assert.equal(state().status, "draining");
    assert.equal(state().current_job, "job-1");
    assert.equal(claims, 1);
    finishJob();
    await run;
    assert.equal(state().status, "stopped");
    assert.equal(claims, 1);
    assert.ok(updates.some(([, update]) => update.$set.status === "finished"));
    assert.equal(process.listenerCount("SIGTERM"), before);
});

test("a stop during an in-flight claim returns the job without executing it", async t => {
    const updates = [];
    const { command } = worker(t, {
        findOneAndUpdate: async () => { command.requestStop(); return { _id: "claimed", jobclass: "NeverRun" }; },
        updateOne: async (...args) => { updates.push(args); },
    });
    command.jobTypes.NeverRun = class { handle() { assert.fail("job started after stop"); } };
    await command.handle();
    assert.deepEqual(updates[0][1].$set, { status: "pending", started_at: null });
});

test("idle SIGINT wakes polling and replicas have separate status files", async t => {
    let polled;
    const polling = new Promise(resolve => { polled = resolve; });
    const { command } = worker(t, { findOneAndUpdate: async () => { polled(); return null; } });
    const run = command.handle();
    await polling;
    process.emit("SIGINT");
    await run;
    assert.equal(command.workerInstanceKey, "default--instance-a");
    process.env.WEBFRAMEZ_QUEUE_INSTANCE = "instance-b";
    const replica = new QueueWorkerCommand();
    replica.workerKey = "default";
    assert.equal(replica.canStart(), true);
    delete process.env.WEBFRAMEZ_QUEUE_INSTANCE;
    assert.equal(replica.workerInstanceKey, "default");
});

test("concurrent schedulers insert one automation occurrence", async t => {
    const jobs = new Map();
    const collection = {
        findOne: async filter => filter._id ? jobs.get(filter._id) : null,
        insertOne: async job => { if (jobs.has(job._id)) throw new Error("duplicate primary key"); jobs.set(job._id, job); },
    };
    const { command: first } = worker(t, collection);
    t.mock.method(DBConnection, "objectId", async value => value);
    const second = new QueueWorkerCommand();
    for (const command of [first, second]) {
        command.workerKey = "default";
        command.workerConfig = {};
        command.runAutomation = QueueWorkerCommand.prototype.runAutomation;
        command.getWorkerAutomation = () => [{}];
        command.checkWorkerAutomation = () => [{ jobclass: "Scheduled", _execution: { key: "same-occurrence" } }];
        command.getNextJobNumber = async () => 1;
        command.wait = async () => { command.requestStop(); };
    }
    await Promise.all([first.runAutomation(), second.runAutomation()]);
    assert.equal(jobs.size, 1);
});
