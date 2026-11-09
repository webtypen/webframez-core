const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { WebApplication, Route } = require('../dist');

test('extensions attach before listening, receive route context and close in reverse order', async () => {
    const application = new WebApplication();
    const calls = [];
    let server;
    const extension = name => ({
        attach(context) {
            assert.equal(context.server.listening, false);
            assert.equal(context.basename, '/api');
            assert.equal(typeof context.modulesLoader.getLoadedModules, 'function');
            calls.push(name);
        },
        async close() { calls.push(`close:${name}`); },
    });

    try {
        server = application.boot({ port: 0, basename: '/api', routesFunction() {
            Route.get('/health', (_req, res) => res.send({ healthy: true }));
        }, extensions: [extension('one'), extension('two')] });
        await once(server, 'listening');
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
        assert.equal(response.status, 200);
        await response.text();
        assert.throws(() => application.boot({}), /only boot once/);
    } finally { await application.close(); }

    await application.close();
    assert.equal(server.listening, false);
    assert.deepEqual(calls, ['one', 'two', 'close:two', 'close:one']);
});

test('failed attachment releases partially attached extensions without listening', async () => {
    const application = new WebApplication();
    const calls = [];
    assert.throws(() => application.boot({ port: 0, routesFunction() {}, extensions: [
        { attach() { calls.push('attach'); }, close() { calls.push('close'); } },
        { attach() { throw new Error('attachment failed'); }, close() { calls.push('failed-close'); } },
    ] }), /attachment failed/);
    await application.close();
    assert.deepEqual(calls, ['attach', 'failed-close', 'close']);
});

test('one cleanup failure still closes remaining extensions and HTTP', async () => {
    const application = new WebApplication();
    let cleaned = false;
    const server = application.boot({ port: 0, routesFunction() {}, extensions: [
        { attach() {}, close() { cleaned = true; } },
        { attach() {}, close() { throw new Error('cleanup failed'); } },
    ] });
    await once(server, 'listening');
    await assert.rejects(application.close(), /cleanup failed/);
    assert.equal(cleaned, true);
    assert.equal(server.listening, false);
});

test('synchronous listen failures release attached extensions', async () => {
    const application = new WebApplication();
    let closed = false;
    assert.throws(() => application.boot({ port: -1, routesFunction() {}, extensions: [
        { attach() {}, close() { closed = true; } },
    ] }), /port/);
    await application.close();
    assert.equal(closed, true);
});
