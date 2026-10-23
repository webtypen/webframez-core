const test = require("node:test");
const assert = require("node:assert/strict");
const {Queue} = require("../dist/Queue/Queue");

test("worker pools bound concurrency and drain every active job without aborting", async t => {
    const pending = [];
    t.mock.method(Queue, "runOnce", async (_classes, signal) => new Promise(resolve => pending.push({signal,resolve})));
    const worker = Queue.createWorker(["Build"], {concurrency:2, intervalMs:10});
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(pending.length, 2);
    let stopped = false;
    const stopping = worker.stop({drain:true}).then(() => { stopped = true; });
    assert.ok(pending.every(job => !job.signal.aborted));
    pending[0].resolve();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(stopped, false);
    assert.equal(pending.length, 2);
    pending[1].resolve();
    await stopping;
});

test("stopping one worker cancels only its own jobs", async t => {
    const signals = [];
    t.mock.method(Queue, "runOnce", async (_classes, signal) => {
        signals.push(signal);
        await new Promise(resolve => signal.addEventListener("abort", resolve, {once:true}));
    });
    const a = Queue.createWorker(["Build"], {concurrency:2});
    const b = Queue.createWorker(["Other"]);
    await a.stop();
    assert.deepEqual(signals.map(signal => signal.aborted), [true,true,false]);
    await b.stop();
    assert.throws(() => Queue.createWorker([], {concurrency:0}));
});
