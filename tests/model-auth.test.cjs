const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, ModelAuth, RouteFacade, Router, Request, Response } = require('../dist');
const { database } = require('../test-support/auth-store.cjs');

async function fixture(options = {}) {
    const db = database();
    const user = { _id: 'alice', email: 'alice@example.test', is_active: true, password: await ModelAuth.hashPassword('secret with spaces ') };
    let lookups = 0;
    class User extends Model {
        static async objectId(value) { return value; }

        static where(key, operator, value) {
            lookups++;
            return { first: async () => user[key] === value ? user : null };
        }
    }
    const auth = new ModelAuth({ model: User, origin: 'https://site.example', ...options, session: { idAdapter: db.idAdapter, database: async () => db, ...options.session } });
    return { auth, db, user, lookups: () => lookups };
}

function request(method, cookies = {}, body = {}, extra = {}) {
    return Object.assign(new Request(), { method, body, headers: { origin: 'https://site.example', 'sec-fetch-site': 'same-origin',
        cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '), 'x-csrf-token': cookies.__Host_wf_csrf || cookies['__Host-wf_csrf'] || '', ...extra } });
}

function jar(response) {
    return Object.fromEntries((response.headers['Set-Cookie'] || []).map(cookie => cookie.split(';')[0].split('=')));
}

test('model auth bootstraps, verifies bcrypt, logs in, refreshes and revokes without exposing tokens', async () => {
    const { auth, db } = await fixture();
    const bootstrap = new Response();
    await auth.handle('csrf', request('GET'), bootstrap);
    assert.equal(bootstrap.content.csrf.length, 43);
    const response = new Response();
    await auth.handle('login', request('POST', jar(bootstrap), { email: ' ALICE@example.test ', password: 'secret with spaces ', subject: 'mallory' }), response);
    assert.equal(response.content.status, 'success');
    assert.doesNotMatch(JSON.stringify(response.content), /token|Hash|password/);
    const cookies = jar(response);
    const session = await auth.authenticate(request('GET', cookies));
    assert.equal(session.subject, 'alice');
    assert.equal(db.tables.get('auth_sessions').size, 1);
    const refreshed = new Response();
    await auth.handle('refresh', request('POST', cookies), refreshed);
    assert.equal(refreshed.content.status, 'success');
    Object.assign(cookies, jar(refreshed));
    const logout = new Response();
    await auth.handle('logout', request('POST', cookies), logout);
    assert.equal(logout.content.status, 'success');
    assert.ok(logout.headers['Set-Cookie'].every(cookie => cookie.includes('Max-Age=0')));
    assert.equal(await auth.authenticate(request('GET', cookies)), null);
});

test('CSRF and configured origin are enforced before model or credential work', async () => {
    const { auth, lookups } = await fixture();
    for (const [extra, code] of [[{}, 'invalid_csrf'], [{ origin: 'http://localhost:3035' }, 'invalid_origin'], [{ origin: 'https://evil.example' }, 'invalid_origin']]) {
        const response = new Response();
        await auth.handle('login', request('POST', {}, { email: 'alice@example.test', password: 'secret' }, extra), response);
        assert.equal(response.statusCode, 403);
        assert.equal(response.content.code, code);
        assert.equal(lookups(), 0);
    }
    assert.throws(() => new ModelAuth({ model: Model, csrfDisabled: true }), /CSRF/);
});

test('invalid credentials, inactive accounts, and structured input cannot create sessions', async () => {
    const { auth, user, db } = await fixture();
    const bootstrap = new Response();
    await auth.handle('csrf', request('GET'), bootstrap);
    for (const [body, expected] of [
        [{ email: { $ne: null }, password: 'secret with spaces ' }, 'missing_login'],
        [{ email: 'alice@example.test', password: 'secret with spaces' }, 'invalid_login'],
        [{ email: 'unknown@example.test', password: 'secret with spaces ' }, 'invalid_login'],
    ]) {
        const response = new Response();
        await auth.handle('login', request('POST', jar(bootstrap), body), response);
        assert.equal(response.content.code, expected);
    }
    user.is_active = false;
    const response = new Response();
    await auth.handle('login', request('POST', jar(bootstrap), { email: user.email, password: 'secret with spaces ' }), response);
    assert.equal(response.content.code, 'inactive_user');
    assert.equal(db.tables.get('auth_sessions')?.size || 0, 0);
});

test('Route.auth inherits groups and exposes the four standard routes with a login alias', () => {
    const original = Router.register;
    const registrations = [];
    Router.register = (...args) => registrations.push(args);
    try {
        const route = new RouteFacade();
        route.group({ prefix: '/v1', middleware: ['site'], domains: ['site.example'] }, () => route.auth('/auth', { model: Model, loginPath: '/login' }));
        assert.deepEqual(registrations.map(([method, path]) => [method, path]), [['GET', '/v1/auth/csrf'], ['POST', '/v1/login'], ['POST', '/v1/auth/logout'], ['POST', '/v1/auth/refresh']]);
        for (const [, , handler, options] of registrations) {
            assert.equal(typeof handler, 'function');
            assert.deepEqual(options, { middleware: ['site'], domains: ['site.example'] });
        }
    } finally {
        Router.register = original;
    }
});


test('browser auth defaults and overrides preserve audience isolation and configured lifetimes', async () => {
    for (const [options, audience] of [
        [{}, 'https://site.example'],
        [{ session: { audience: 'nested' } }, 'nested'],
        [{ audience: 'top-level', session: { audience: 'nested', accessTokenSeconds: 90, sessionSeconds: 180 } }, 'top-level'],
    ]) {
        const { auth } = await fixture(options);
        const created = await auth.sessions.create('alice');
        assert.equal(created.session.audience, audience);
        assert.equal(created.auth_expires_at - created.session.createdAt, (options.session?.accessTokenSeconds || 15 * 60) * 1000);
        assert.equal(created.session.expiresAt - created.session.createdAt, (options.session?.sessionSeconds || 30 * 86400) * 1000);
    }
});

test('Route.auth applies localized defaults and allows individual message overrides', async () => {
    const { auth } = await fixture({ locale: 'de', messages: { invalid_csrf: 'Custom CSRF message' } });
    const rejected = new Response();
    await auth.handle('login', request('POST'), rejected);
    assert.equal(rejected.content.message, 'Custom CSRF message');
    const bootstrap = new Response();
    auth.bootstrap(request('GET'), bootstrap);
    const missing = new Response();
    await auth.handle('login', request('POST', jar(bootstrap)), missing);
    assert.equal(missing.content.message, 'Bitte gib E-Mail-Adresse und Passwort an.');
    await assert.rejects(auth.verifyCredentials(request('POST')), { message: missing.content.message });

    const original = Router.register;
    const registrations = [];
    Router.register = (...args) => registrations.push(args);
    try {
        const db = database();
        new RouteFacade().auth('/auth', { model: Model, audience: 'route', origin: 'https://site.example', locale: 'de', session: { idAdapter: db.idAdapter, database: async () => db } });
        const response = new Response();
        await registrations.find(([method, path]) => method === 'POST' && path === '/auth/login')[2](request('POST'), response);
        assert.equal(response.content.message, 'Der Login konnte gerade nicht verarbeitet werden. Bitte lade die Seite neu.');
    } finally {
        Router.register = original;
    }
});

test('Core records login metadata, throttles activity updates and keeps custom callbacks', async () => {
    let loggedIn = false, authenticated = false;
    const { auth, db } = await fixture({ onLogin: () => { loggedIn = true; }, onAuthenticate: () => { authenticated = true; } });
    const bootstrap = new Response();
    auth.bootstrap(request('GET'), bootstrap);
    const response = new Response();
    const session = await auth.login(request('POST', jar(bootstrap), {}, { 'user-agent': 'X'.repeat(600) }), response, async () => 'alice');
    const row = db.tables.get('auth_sessions').get(session.id);
    assert.equal(loggedIn, true);
    assert.equal(row.userAgent.length, 512);
    assert.equal(row.lastActiveAt, row.createdAt);
    row.lastActiveAt -= 120_000;
    const resolved = await auth.resolve(request('GET', jar(response)));
    assert.equal(authenticated, true);
    assert.equal(resolved.session.lastActiveAt, row.lastActiveAt);
    assert.ok(row.lastActiveAt >= row.createdAt);
    const lastActiveAt = row.lastActiveAt;
    await auth.resolve(request('GET', jar(response)));
    assert.equal(row.lastActiveAt, lastActiveAt);
    const disabled = await fixture({ trackActivity: false });
    const disabledBootstrap = new Response();
    disabled.auth.bootstrap(request('GET'), disabledBootstrap);
    const untracked = await disabled.auth.login(request('POST', jar(disabledBootstrap)), new Response(), async () => 'alice');
    assert.equal(disabled.db.tables.get('auth_sessions').get(untracked.id).userAgent, undefined);
});
