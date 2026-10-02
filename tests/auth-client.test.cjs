const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(bootstrapStatus = 200) {
    const calls = [];
    const window = { location: { href: 'https://site.example/mount/login', origin: 'https://site.example', protocol: 'https:' },
        fetch: async (...args) => { calls.push(args); return new Response(JSON.stringify({ csrf: 'fresh-bootstrap-token' }), { status: bootstrapStatus }); } };
    const context = { exports: {}, window, document: { cookie: '__Host-wf_csrf=old-cookie-token' }, URL, Request, Headers };
    vm.runInNewContext(fs.readFileSync(require.resolve('../auth-client'), 'utf8'), context);
    return { ...context.exports, calls };
}

test('browser adapter bootstraps login, preserves headers/body and uses the returned token under a basename', async () => {
    const { createAuthFetch, calls } = fixture();
    const fetch = createAuthFetch({ basePath: '/mount/api/auth' });
    await fetch('/mount/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'payload' });
    assert.equal(calls[0][0], '/mount/api/auth/csrf');
    assert.equal(calls[0][1].cache, 'no-store');
    assert.equal(calls[1][1].headers.get('X-CSRF-Token'), 'fresh-bootstrap-token');
    assert.equal(calls[1][1].headers.get('Content-Type'), 'application/json');
    assert.equal(calls[1][1].body, 'payload');
    await fetch('/mount/api/auth/logout', { method: 'POST' });
    assert.equal(calls.at(-1)[1].headers.get('X-CSRF-Token'), 'old-cookie-token');
});

test('browser adapter never adds CSRF to external requests or GET and stops if bootstrap fails', async () => {
    const { createAuthFetch, calls } = fixture(403);
    const fetch = createAuthFetch();
    await fetch('https://evil.example/api/auth/logout', { method: 'POST' });
    assert.equal(calls.at(-1)[1].headers, undefined);
    await fetch('/api/auth/csrf');
    assert.equal(calls.at(-1)[1], undefined);
    const before = calls.length;
    const response = await fetch('/api/auth/login', { method: 'POST' });
    assert.equal(response.status, 403);
    assert.equal(calls.length, before + 1);
});

test('browser adapter refreshes once for parallel expired-access failures and replays each rejected request once', async () => {
    const context = { exports: {}, window: { location: { href: 'https://site.example/', origin: 'https://site.example', protocol: 'https:' } },
        document: { cookie: '__Host-wf_csrf=bound-csrf' }, URL, Request, Headers };
    vm.runInNewContext(fs.readFileSync(require.resolve('../auth-client'), 'utf8'), context);
    let refreshes = 0, attempts = 0, renewed = false;
    const fetch = context.exports.createAuthFetch({}, async (input, init) => {
        if (input === '/api/auth/refresh') {
            refreshes++;
            assert.equal(init.headers.get('X-CSRF-Token'), 'bound-csrf');
            await new Promise(resolve => setTimeout(resolve, 10));
            renewed = true;
            return new Response('{}', { status: 200 });
        }
        attempts++;
        assert.equal(init.body, 'payload');
        return new Response(JSON.stringify(renewed ? { status: 'success' } : { code: 'invalid_csrf' }), { status: renewed ? 200 : 403 });
    });
    const results = await Promise.all([fetch('/api/action', { method: 'POST', body: 'payload' }), fetch('/api/action', { method: 'POST', body: 'payload' })]);
    assert.equal(refreshes, 1);
    assert.equal(attempts, 4);
    assert.deepEqual(results.map(response => response.status), [200, 200]);
});

test('browser adapter preserves permission failures and never loops when refresh is rejected', async () => {
    const { createAuthFetch } = fixture();
    let calls = 0;
    const forbidden = createAuthFetch({}, async () => { calls++; return new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 }); });
    assert.equal((await forbidden('/api/action', { method: 'POST' })).status, 403);
    assert.equal(calls, 1);
    const expired = createAuthFetch({}, async input => { calls++; return new Response(JSON.stringify({ code: input === '/api/auth/refresh' ? 'unauthorized' : 'invalid_csrf' }), { status: 403 }); });
    assert.equal((await expired('/api/action', { method: 'POST' })).status, 403);
    assert.equal(calls, 3);
});

test('shared browser lock covers refresh and replay across independent tab adapters', async () => {
    const order = [], names = [], attempts = new Map();
    let queue = Promise.resolve();
    const context = { exports: {}, window: { location: { href: 'https://site.example/', origin: 'https://site.example', protocol: 'https:' } },
        document: { cookie: '__Host-wf_csrf=bound-csrf' }, URL, Request, Headers,
        navigator: { locks: { request(name, run) { names.push(name); const result = queue.then(run); queue = result.then(() => {}, () => {}); return result; } } } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../auth-client'), 'utf8'), context);
    const original = async input => {
        if (input === '/api/auth/refresh') { order.push('refresh'); await new Promise(resolve => setTimeout(resolve, 5)); return new Response('{}'); }
        const count = (attempts.get(input) || 0) + 1; attempts.set(input, count);
        if (count === 1) return new Response(JSON.stringify({ code: 'invalid_csrf' }), { status: 403 });
        order.push(input);
        return new Response('{}');
    };
    const first = context.exports.createAuthFetch({}, original), second = context.exports.createAuthFetch({}, original);
    const results = await Promise.all([first('/api/one', { method: 'POST' }), second('/api/two', { method: 'POST' })]);
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    assert.deepEqual(order, ['refresh', '/api/one', 'refresh', '/api/two']);
    assert.deepEqual(names, ['webframez-auth:/api/auth', 'webframez-auth:/api/auth']);
});
