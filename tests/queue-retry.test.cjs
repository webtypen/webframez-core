const test = require('node:test');
const assert = require('node:assert/strict');
const { Config, DBConnection, BaseQueueJob, QueueRetryPolicy, QueueRetryLimitError, QueueJobsRegisty, Queue } = require('../dist');
const { QueueWorkerCommand } = require('../dist/Commands/QueueWorkerCommand');
const { ErrorHandler } = require('../dist/ErrorHandling/ErrorHandler');
const { NotificationService } = require('../dist/Notifications/NotificationService');
const start = new Date('2026-10-21T12:00:00Z');

function configuration(t, value = {}) {
    const previous = Config.configs;
    Config.configs = { queue: value };
    t.after(() => { Config.configs = previous; });
}

function harness(t, engine, Handler, initial = {}) {
    let row = { _id: 'job', number: 1, jobclass: 'PaymentJob', status: 'pending', created_at: start, ...initial };
    let command;
    const collection = {
        updateMany: async () => ({ matchedCount: 0 }),
        findOneAndUpdate: async (filter, update) => {
            assert.equal(filter.status, 'pending');
            if (row.status !== 'pending' || row.not_before && row.not_before > new Date()) return null;
            Object.assign(row, structuredClone(update.$set));
            return structuredClone(row);
        },
        updateOne: async (filter, update) => {
            if (filter.lease_token && (filter.lease_token !== row.lease_token || row.status !== filter.status)) return { matchedCount: 0 };
            Object.assign(row, structuredClone(update.$set));
            if (update.$set.status) command?.requestStop();
            return { matchedCount: 1 };
        },
    };
    t.mock.method(DBConnection, 'getConnection', async () => ({}));
    t.mock.method(DBConnection, 'documentStore', () => ({ collection: () => collection }));
    t.mock.method(DBConnection, 'getDocumentStore', async () => ({ collection: () => collection }));
    t.mock.method(QueueJobsRegisty, 'getJobOrFail', () => Handler);
    t.mock.method(ErrorHandler, 'report', async () => {});
    return {
        row: () => row,
        async run() {
            if (engine === 'embedded') return Queue.runOnce(['PaymentJob']);
            command = new QueueWorkerCommand();
            command.workerKey = 'test'; command.workerConfig = {};
            command.jobTypes = { PaymentJob: Handler };
            command.updateWorkerStatus = () => {};
            command.runAutomation = async () => {};
            command.getWorkerJobclasses = () => ['PaymentJob'];
            command.log = () => {};
            command.waitRun = async () => {};
            command.checkStop = () => command.stopping;
            await command.run();
        },
    };
}

test('configuration precedence and invalid unlimited policies', t => {
    configuration(t, { retry: { maxAttempts: 90 }, jobs: { PaymentJob: { retry: { maxAttempts: 60 } } } });
    assert.equal(QueueRetryPolicy.resolve('Other').maxAttempts, 90);
    assert.equal(QueueRetryPolicy.resolve('PaymentJob', { retry: { maxAttempts: 70 } }).maxAttempts, 60);
    assert.equal(QueueRetryPolicy.resolve('PaymentJob', undefined, { maxAttempts: 50 }).maxAttempts, 50);
    for (const value of [0, -1, Infinity, NaN, 1.5, '3', null]) {
        assert.throws(() => QueueRetryPolicy.resolve('Other', undefined, { maxAttempts: value }), QueueRetryLimitError);
    }
    assert.throws(() => QueueRetryPolicy.resolve('Other', undefined, { stages: [] }), QueueRetryLimitError);
    assert.throws(() => QueueRetryPolicy.resolve('Other', undefined, { stages: [{ attempts: 2, delaySeconds: -1 }] }), QueueRetryLimitError);
});

test('staged retries honor boundaries, explicit minimum delays and deadline wakeups', t => {
    configuration(t);
    const policy = QueueRetryPolicy.resolve('PaymentJob', undefined, {
        stages: [{ attempts: 3, delaySeconds: 0 }, { attempts: 2, delaySeconds: 10 }, { attempts: 5, delaySeconds: 30 }],
        maxAgeSeconds: 60,
    });
    const job = { first_started_at: start };
    for (const [attempt, seconds] of [[1, 0], [2, 0], [3, 10], [4, 10], [5, 30], [9, 30]]) {
        assert.equal(+QueueRetryPolicy.rescheduleAt(policy, job, attempt, start, start), +start + seconds * 1000);
    }
    assert.equal(+QueueRetryPolicy.rescheduleAt(policy, job, 5, new Date(+start + 90000), start), +start + 60000);
    assert.throws(() => QueueRetryPolicy.rescheduleAt(policy, job, 10, start, start), QueueRetryLimitError);
    assert.throws(() => QueueRetryPolicy.assertCanRun(policy, job, 1, new Date(+start + 60000)), QueueRetryLimitError);
});

for (const engine of ['console', 'embedded']) {
    test(`${engine}: retryable lock conflict survives worker restart and succeeds`, async t => {
        t.mock.timers.enable({ apis: ['Date'], now: start });
        configuration(t);
        let calls = 0;
        class Handler extends BaseQueueJob {
            async handle() { if (++calls === 1) throw Object.assign(new Error('locked'), { retryable: true }); }
        }
        const h = harness(t, engine, Handler);
        await h.run();
        assert.equal(h.row().status, 'pending'); assert.equal(h.row().attempts_made, 1);
        assert.equal(h.row().failed_attempts, 1); assert.equal(+h.row().not_before, +start + 30000);
        t.mock.timers.tick(30000);
        await h.run();
        assert.equal(calls, 2); assert.equal(h.row().status, 'finished'); assert.equal(h.row().not_before, null);
    });

    test(`${engine}: error budget is finite and permanent failures never retry`, async t => {
        t.mock.timers.enable({ apis: ['Date'], now: start });
        configuration(t, { retry: { maxErrorRetries: 1, retryOn: 'all' } });
        let calls = 0;
        class Handler extends BaseQueueJob { async handle() { calls++; throw new Error('transient'); } }
        const h = harness(t, engine, Handler);
        await h.run(); t.mock.timers.tick(30000); await h.run();
        assert.equal(h.row().status, 'failed'); assert.equal(calls, 2);
        const policy = QueueRetryPolicy.resolve('PaymentJob');
        assert.equal(QueueRetryPolicy.retryAt(policy, {}, 1, 1, { retryable: false }, start), null);
        assert.equal(QueueRetryPolicy.retryAt({ ...policy, retryOn: 'never' }, {}, 1, 1, { retryable: true }, start), null);
    });

    test(`${engine}: executeAgain cannot bypass total attempts, including legacy history`, async t => {
        t.mock.timers.enable({ apis: ['Date'], now: start });
        configuration(t, { retry: { maxAttempts: 3 } });
        let calls = 0, exhausted = 0;
        class Handler extends BaseQueueJob {
            async handle() { calls++; return this.executeAgain(0); }
            async onRetryExhausted() { exhausted++; }
        }
        const h = harness(t, engine, Handler, { executions: [{ status: 'finished', started_at: start }] });
        await h.run(); t.mock.timers.tick(1000); await h.run();
        assert.equal(calls, 2); assert.equal(h.row().status, 'failed'); assert.equal(exhausted, 1);
    });

    test(`${engine}: deadline skips handler and bounded finalization retries never rerun it`, async t => {
        t.mock.timers.enable({ apis: ['Date'], now: new Date(+start + 86400000) });
        configuration(t);
        let exhausted = 0;
        class Handler extends BaseQueueJob {
            async handle() { assert.fail('expired handler executed'); }
            async onRetryExhausted() { exhausted++; throw Object.assign(new Error('locked'), { retryable: true }); }
        }
        const h = harness(t, engine, Handler, { first_started_at: start });
        for (let i = 0; i < 3; i++) { await h.run(); t.mock.timers.tick(30000); }
        assert.equal(exhausted, 3); assert.equal(h.row().status, 'failed'); assert.ok(h.row().retry_exhaustion_error);
    });

    test(`${engine}: final provider reconciliation can recover a completed payment`, async t => {
        t.mock.timers.enable({ apis: ['Date'], now: new Date(+start + 86400000) });
        configuration(t);
        class Handler extends BaseQueueJob {
            async handle() { assert.fail('expired handler executed'); }
            async onRetryExhausted() { return 'finished'; }
        }
        const h = harness(t, engine, Handler, { first_started_at: start });
        await h.run(); assert.equal(h.row().status, 'finished');
    });
}

test('console notification remains pending during retries and becomes error on exhaustion', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: start });
    configuration(t, { retry: { maxErrorRetries: 1 } });
    const statuses = [];
    t.mock.method(NotificationService, 'getNotification', async () => ({ target: 'example', target_id: 'target' }));
    t.mock.method(NotificationService, 'resolveTarget', async () => ({ targetModel: {} }));
    t.mock.method(NotificationService, 'attachTargetModel', () => {});
    t.mock.method(NotificationService, 'setChangingStatus', async (_notification, status) => { statuses.push(status); });
    class Handler extends BaseQueueJob { async handle() { throw Object.assign(new Error('locked'), { retryable: true }); } }
    const h = harness(t, 'console', Handler, { notification_queue_job: true, _notification: 'notification' });
    await h.run(); t.mock.timers.tick(30000); await h.run();
    assert.deepEqual(statuses, ['running', 'pending', 'running', 'error']);
});

 test('a job scheduled long ago starts its retry age budget on its first execution', t => {
    configuration(t);
    const policy = QueueRetryPolicy.resolve('FutureJob');
    const now = new Date(+start + 30 * 86400000);
    assert.doesNotThrow(() => QueueRetryPolicy.assertCanRun(policy, { created_at: start }, 0, now));
});
