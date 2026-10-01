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
