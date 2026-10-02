const test = require('node:test');
const assert = require('node:assert/strict');
const { createBearerAuthFetch } = require('../bearer-auth-client');

function setup(handler) {
    let pair = { auth_token: 'old', refresh_token: 'refresh-old', auth_expires_at: Date.now() + 60000, refresh_expires_at: Date.now() + 3600000 };
    const calls = [];
    const fetch = createBearerAuthFetch({ configuration: url => url.origin === 'https://api.example'
        ? { key: 'api', refreshUrl: 'https://api.example/auth/refresh' } : null,
        load: async () => pair, save: async (_, value) => { pair = value; }, clear: async () => { pair = null; },
    }, async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); });
    return { fetch, calls, clear: () => { pair = null; }, pair: () => pair };
}

const renewed = () => ({ status: 'success', auth_token: 'new', refresh_token: 'refresh-new', auth_expires_at: Date.now() + 60000, refresh_expires_at: Date.now() + 3600000 });

test('parallel bearer requests share one refresh and retry only explicit unauthorized errors', async () => {
    let refreshes = 0;
    const { fetch, calls } = setup(async (url, init) => {
        if (url.endsWith('/refresh')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json(renewed()); }
        return new Headers(init.headers).get('Authorization') === 'Bearer old' ? Response.json({ code: 'unauthorized' }, { status: 401 }) : Response.json({ ok: true });
    });
    const results = await Promise.all([fetch('https://api.example/items', { method: 'POST', body: 'payload' }), fetch('https://api.example/items')]);
    assert.equal(refreshes, 1);
    assert.ok(results.every(result => result.ok));
    assert.ok(calls.every(call => call.init.credentials === 'omit' && call.init.redirect === 'error'));
    assert.equal(calls.find(call => call.url.endsWith('/refresh')).init.headers.Authorization, undefined);
});

test('unrelated origins and relative native assets receive no injected credentials', async () => {
    const { fetch, calls } = setup(async () => Response.json({ ok: true }));
    await fetch('https://untrusted.example/items');
    await fetch('/assets/icon.png');
    assert.ok(calls.every(call => call.init === undefined));
});

test('ambiguous refresh failures clear credentials instead of replaying a rotating token', async () => {
    const { fetch, pair } = setup(async url => {
        if (url.endsWith('/refresh')) throw new Error('network timeout');
        return Response.json({ code: 'unauthorized' }, { status: 401 });
    });
    const response = await fetch('https://api.example/items');
    assert.equal(response.status, 401);
    assert.equal(pair(), null);
});

test('refresh finishing after logout does not restore the cleared session', async () => {
    let clear;
    const state = setup(async url => {
        if (url.endsWith('/refresh')) { clear(); return Response.json(renewed()); }
        return Response.json({ code: 'unauthorized' }, { status: 401 });
    });
    clear = state.clear;
    assert.equal((await state.fetch('https://api.example/items')).status, 401);
    assert.equal(state.pair(), null);
});
