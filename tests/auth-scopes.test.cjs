const assert = require('node:assert/strict');
const test = require('node:test');
const { Auth, AuthFacade, AuthScope, Config, Model, Request, Response, RouteFacade, Router } = require('../dist');
const { database } = require('../test-support/auth-store.cjs');

function config(t, value) {
    const previous = Config.get('auth');
    Config.register('auth', value);
    t.after(() => Config.register('auth', previous));
}

class User extends Model {
    static async objectId(value) { return value; }

    static where(_key, _operator, value) {
        return { first: async () => ({ _id: value, email: 'alice@example.test', is_active: true }) };
    }
}

test('main is automatically created from Config and scopes are stable singleton objects', t => {
    config(t, { defaults: { origin: 'https://site.example', locale: 'de' }, scopes: { main: { model: User, audience: 'website' } } });
    const auth = new AuthFacade();
    assert.ok(auth.scope() instanceof AuthScope);
    assert.equal(auth.scope(), auth.scope('main'));
    assert.equal(auth.scope().key, 'main');
    assert.equal(auth.scope().configuration.locale, 'de');
    assert.equal(auth.scope().cookies.origin, 'https://site.example');
});

test('automatic main can be disabled while configured and runtime scopes stay available', t => {
    config(t, { main: false, defaults: { origin: 'https://site.example' }, scopes: { admin: { model: User } } });
    const auth = new AuthFacade();
    assert.throws(() => auth.scope(), /not registered/);
    const registered = auth.registerScope('staff', { model: User });
    assert.equal(auth.scope('staff'), registered);
    assert.notEqual(auth.scope('staff').cookies.prefix, auth.scope('admin').cookies.prefix);
    assert.throws(() => auth.registerScope('../invalid', { model: User }), /scope key/);
    assert.throws(() => auth.scope('missing'), /not registered/);
});

test('storage, CSRF, refresh, listing and revocation are isolated by scope even with the same audience', async t => {
    const db = database();
    config(t, { defaults: { origin: 'https://site.example', audience: 'shared', session: { idAdapter: db.idAdapter, database: async () => db } } });
    const auth = new AuthFacade();
    const main = auth.registerScope('main', { model: User });
    const staff = auth.registerScope('staff', { model: User });
    const first = await main.sessions.create('alice');
    const second = await staff.sessions.create('alice');
    const record = db.tables.get('auth_sessions').get(first.session.id);
    assert.equal(record.scope, 'main');
    assert.equal(record._subject, 'alice');
    assert.equal(record._id, first.session.id);
    assert.equal('id' in record, false);
    assert.equal('subject' in record, false);
    assert.equal(await staff.sessions.authenticate(first.auth_token), null);
    assert.equal(await staff.sessions.inspect(first.session.id), null);
    assert.equal(await staff.sessions.verifyCsrf(first.auth_token, first.csrf_token), false);
    assert.equal(await staff.sessions.refresh(first.refresh_token), null);
    await staff.sessions.revoke(first.session.id);
    assert.ok(await main.sessions.authenticate(first.auth_token));
    await staff.sessions.revokeAll('alice');
    assert.ok(await main.sessions.authenticate(first.auth_token));
    assert.equal(await staff.sessions.authenticate(second.auth_token), null);
    assert.equal((await main.sessions.list('alice')).length, 1);
});

test('Route.auth resolves the configured scope and applies partial overrides to that shared registry', async t => {
    config(t, { defaults: { origin: 'https://site.example' } });
    Auth.registerScope('route-test', { model: User, locale: 'de', audience: 'route', session: { sessionSeconds: 120 }, messages: { invalid_login: 'Existing' } });
    const original = Router.register;
    const registrations = [];
    Router.register = (...args) => registrations.push(args);
    t.after(() => Router.register = original);
    new RouteFacade().auth('/auth', { auth: 'route-test', messages: { invalid_csrf: 'Overridden' } });
    assert.equal(Auth.scope('route-test').configuration.messages.invalid_login, 'Existing');
    assert.equal(Auth.scope('route-test').configuration.session.sessionSeconds, 120);
    const response = new Response();
    const req = Object.assign(new Request(), { method: 'POST', headers: { origin: 'https://site.example' } });
    await registrations.find(([method, path]) => method === 'POST' && path === '/auth/login')[2](req, response);
    assert.equal(response.content.message, 'Overridden');
    assert.throws(() => new RouteFacade().auth('/bad', { auth: () => main }), /scope key/);
});


test('Route.auth lifecycle hooks receive Request, User and Scope and before exceptions stop mutations', async t => {
    const db = database(), calls = [];
    config(t, { defaults: { origin: 'https://site.example', session: { database: async () => db, idAdapter: db.idAdapter } } });
    let blockLogin = true, blockLogout = true;
    Auth.registerScope('hooks', { model: User, verifyPassword: async () => true });
    const original = Router.register, registrations = [];
    Router.register = (...args) => registrations.push(args);
    t.after(() => Router.register = original);
    const check = (name, req, user, scope) => {
        assert.ok(req instanceof Request);
        assert.equal(user._id, 'alice');
        assert.equal(scope, Auth.scope('hooks'));
        calls.push(name);
    };
    new RouteFacade().auth('/hooks', {
        auth: 'hooks',
        beforeLogin: (req, user, scope) => { check('beforeLogin', req, user, scope); if (blockLogin) throw new Error('Login denied by policy'); },
        afterLogin: (req, user, scope) => check('afterLogin', req, user, scope),
        beforeLogout: (req, user, scope) => { check('beforeLogout', req, user, scope); if (blockLogout) throw new Error('Logout denied by policy'); },
        afterLogout: (req, user, scope) => check('afterLogout', req, user, scope),
    });
    const originalWhere = User.where;
    User.where = (key, op, value) => ({ first: async () => Object.assign(new User(), { _id: 'alice', email: 'alice@example.test', password: 'HASH', is_active: true }) });
    t.after(() => { User.where = originalWhere; });
    const scope = Auth.scope('hooks');
    const jar = res => Object.fromEntries((res.headers['Set-Cookie'] || []).map(value => value.split(';')[0].split('=')));
    const request = (method, cookies = {}, headers = {}) => Object.assign(new Request(), {
        method, body: { email: 'alice@example.test', password: 'secret' },
        headers: { origin: 'https://site.example', 'sec-fetch-site': 'same-origin',
            cookie: Object.entries(cookies).map(([key, value]) => key + '=' + value).join('; '),
            'x-csrf-token': cookies[scope.cookies.prefix + 'csrf'] || '', ...headers },
    });
    const bootstrap = new Response();
    scope.bootstrap(request('GET'), bootstrap);
    const invoke = async (operation, req) => {
        const response = new Response();
        await registrations.find(([method, path]) => method === 'POST' && path === '/hooks/' + operation)[2](req, response);
        return response;
    };
    const denied = await invoke('login', request('POST', jar(bootstrap)));
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.content.code, 'login_blocked');
    assert.equal(denied.content.message, 'Login denied by policy');
    assert.equal(db.tables.get('auth_sessions')?.size || 0, 0);
    assert.equal(denied.headers['Set-Cookie'], undefined);
    assert.deepEqual(calls, ['beforeLogin']);
    blockLogin = false;
    const loggedIn = await invoke('login', request('POST', jar(bootstrap)));
    assert.equal(loggedIn.content.status, 'success');
    assert.deepEqual(calls, ['beforeLogin', 'beforeLogin', 'afterLogin']);
    const cookies = jar(loggedIn);
    const blockedLogout = await invoke('logout', request('POST', cookies));
    assert.equal(blockedLogout.content.code, 'logout_blocked');
    assert.equal(blockedLogout.content.message, 'Logout denied by policy');
    assert.equal(blockedLogout.headers['Set-Cookie'], undefined);
    assert.ok(await scope.sessions.authenticate(cookies[scope.cookies.prefix + 'access']));
    const count = calls.length;
    const invalidCsrf = await invoke('logout', request('POST', cookies, { 'x-csrf-token': '' }));
    assert.equal(invalidCsrf.content.code, 'invalid_csrf');
    assert.equal(calls.length, count);
    blockLogout = false;
    const loggedOut = await invoke('logout', request('POST', cookies));
    assert.equal(loggedOut.content.status, 'success');
    assert.equal(await scope.sessions.authenticate(cookies[scope.cookies.prefix + 'access']), null);
    assert.ok(loggedOut.headers['Set-Cookie'].every(cookie => cookie.includes('Max-Age=0')));
    assert.deepEqual(calls.slice(-2), ['beforeLogout', 'afterLogout']);
});
