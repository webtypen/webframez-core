const test = require('node:test');
const assert = require('node:assert/strict');
const { Config, DBConnection, BaseQueueJob, QueueJobsRegisty, Queue, ErrorHandler, WebApplication, LambdaApplication } = require('../dist');
const { QueueWorkerCommand } = require('../dist/Commands/QueueWorkerCommand');

for (const engine of ['embedded', 'console']) test(`${engine}: each retry has one contextual event, explicit reporting deduplicates rethrow`, async t => {
    const previous = Config.configs; Config.configs = { queue: { retry: { delaySeconds: 0 } } };
    t.after(() => { Config.configs = previous; ErrorHandler.clearHandlers(); });
    let row = { _id: 'one', number: 1, jobclass: 'FailingJob', status: 'pending', created_at: new Date() }, command;
    const events = []; const off = ErrorHandler.onReport(event => events.push(event)); t.after(off); ErrorHandler.setHandler(() => {});
    const shared = new Error('same exception object across retries');
    class FailingJob extends BaseQueueJob { async handle() { await ErrorHandler.report(shared); throw shared; } }
    const collection = {
        updateMany: async () => ({}),
        findOneAndUpdate: async (_filter, update) => { if (row.status !== 'pending') return null; Object.assign(row, update.$set); return structuredClone(row); },
        updateOne: async (_filter, update) => { Object.assign(row, structuredClone(update.$set)); if (update.$set.status) command?.requestStop(); return { matchedCount: 1 }; },
    };
    t.mock.method(DBConnection, 'getConnection', async () => ({}));
    t.mock.method(DBConnection, 'documentStore', () => ({ collection: () => collection }));
    t.mock.method(DBConnection, 'getDocumentStore', async () => ({ collection: () => collection }));
    t.mock.method(QueueJobsRegisty, 'getJobOrFail', () => FailingJob);
    for (let attempt = 0; attempt < 2; attempt++) {
        row.status = 'pending'; row.not_before = null;
        if (engine === 'embedded') await Queue.runOnce(['FailingJob']);
        else {
            command = new QueueWorkerCommand(); command.workerKey = 'payments'; command.workerConfig = {};
            command.jobTypes = { FailingJob }; command.updateWorkerStatus = () => {}; command.runAutomation = async () => {};
            command.getWorkerJobclasses = () => ['FailingJob']; command.log = () => {}; command.waitRun = async () => {}; command.checkStop = () => command.stopping;
            await command.run();
        }
    }
    assert.equal(events.length, 2); assert.notEqual(events[0].eventId, events[1].eventId);
    assert.deepEqual(events.map(event => event.job.attempt), [1, 2]); assert.ok(events.every(event => event.job.worker && event.job.id === 'one'));
});

test('synchronous web and Lambda boot exceptions reach the independent error channel', async t => {
    const events = []; const off = ErrorHandler.onReport(event => events.push(event)); t.after(off); ErrorHandler.setHandler(() => {});
    const failing = {}; Object.defineProperty(failing, 'config', { get() { throw new Error('boot error'); } });
    assert.throws(() => new WebApplication().boot(failing), /boot error/);
    assert.throws(() => new LambdaApplication().boot({}, {}, failing), /boot error/);
    assert.deepEqual(events.map(event => event.applicationType), ['WebApplication', 'LambdaApplication']);
});
