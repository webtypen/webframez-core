const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { Auth, AuthScope, Model, Request, Response } = require('../dist');
const { database } = require('../test-support/auth-store.cjs');

async function fixture(options = {}) {
    const db = database();
    class User extends Model {
        __table = 'users';

        static async objectId(value) { return value; }

        static where(key, _operator, value) {
            return { first: async () => {
                const row = await db.collection('users').findOne({ [key]: value });
                return row ? Object.assign(new User(), row) : null;
            } };
        }
    }
    await db.collection('users').insertOne({ _id: 'alice', email: 'alice@example.test', is_active: true, password: await bcrypt.hash('old-password', 10) });
    const config = { model: User, origin: 'https://site.example', ...options, session: { database: async () => db, idAdapter: db.idAdapter, ...options.session } };
    return { db, User, config, auth: new AuthScope(config) };
}

function request(pair, method = 'GET') {
    return Object.assign(new Request(), { method, headers: { cookie: `__Host-wf_access=${pair.auth_token}; __Host-wf_refresh=${pair.refresh_token}; __Host-wf_csrf=${pair.csrf_token}`, origin: 'https://site.example', 'x-csrf-token': pair.csrf_token } });
}

test('password reset stores only a hash, enforces cooldown atomically and conceals unknown accounts', async () => {
    const { db, auth } = await fixture();
    const tokens = [];
    const deliver = (_user, token, expires) => { tokens.push(token); assert.ok(expires > Date.now()); };
    await Promise.all([auth.passwordReset.request('ALICE@example.test', deliver), auth.passwordReset.request('alice@example.test', deliver)]);
    assert.equal(tokens.length, 1);
    await auth.passwordReset.request('missing@example.test', deliver);
    assert.equal(tokens.length, 1);
    assert.equal(JSON.stringify([...db.tables.get('users').values()]).includes(tokens[0]), false);
    assert.ok(await auth.passwordReset.validate(tokens[0]));
    assert.equal(await auth.passwordReset.validate(tokens[0] + 'x'), null);
    const wrongScope = new AuthScope({ ...auth.configuration, key: 'staff' });
    assert.equal(await wrongScope.passwordReset.validate(tokens[0]), null);
});

test('reset changes the password and consumes its token in one atomic operation; all matching registered scopes are revoked', async () => {
    const { db, User, config } = await fixture();
    const main = Auth.registerScope('main', config);
    const staff = Auth.registerScope('staff', config);
    const first = await main.sessions.create('alice'), second = await staff.sessions.create('alice');
    let token;
    await main.passwordReset.request('alice@example.test', (_user, value) => token = value);
    const results = await Promise.all([main.passwordReset.reset(token, 'new-password'), main.passwordReset.reset(token, 'other-password')]);
    assert.equal(results.filter(Boolean).length, 1);
    const row = await db.collection('users').findOne({ _id: 'alice' });
    assert.equal('auth_reset_main_hash' in row, false);
    assert.equal(await main.passwordReset.validate(token), null);
    assert.equal(await main.passwordReset.reset(token, 'again'), null);
    assert.equal(await main.sessions.authenticate(first.auth_token), null);
    assert.equal(await staff.sessions.authenticate(second.auth_token), null);
    assert.ok(await bcrypt.compare(results[0] ? 'new-password' : 'other-password', row.password));
});

test('reset expiry, account status and subsequent password changes invalidate tokens; scope settings can disable reset', async () => {
    const { db, auth } = await fixture({ passwordReset: { tokenSeconds: 1, cooldownSeconds: 1, revokeSessions: false } });
    let token;
    await auth.passwordReset.request('alice@example.test', (_user, value) => token = value);
    const row = db.tables.get('users').get('alice');
    row.is_active = false;
    assert.equal(await auth.passwordReset.validate(token), null);
    assert.equal(await auth.passwordReset.reset(token, 'new-password'), null);
    row.is_active = true;
    row.auth_reset_main_expires_at = Date.now() - 1;
    assert.equal(await auth.passwordReset.reset(token, 'new-password'), null);
    row.auth_reset_main_expires_at = Date.now() + 10000;
    row.password = await bcrypt.hash('changed-elsewhere', 10);
    assert.equal(await auth.passwordReset.validate(token), null);
    assert.equal(new AuthScope({ ...auth.configuration, passwordReset: false }).passwordReset, null);
    assert.throws(() => new AuthScope({ ...auth.configuration, passwordReset: { tokenSeconds: 0 } }), /positive/);
});

test('short access expiry resumes server GETs, keeps the refresh secret and never bypasses unsafe-request CSRF', async () => {
    const { db, auth } = await fixture();
    const pair = await auth.sessions.create('alice');
    assert.equal(pair.auth_expires_at - pair.session.createdAt, 15 * 60 * 1000);
    db.tables.get('auth_sessions').get(pair.session.id).accessExpiresAt = Date.now() - 1;
    const response = new Response();
    assert.ok(await auth.resolve(request(pair), response));
    const parallel = await Promise.all(Array.from({ length: 5 }, () => auth.resolve(request(pair), new Response())));
    assert.ok(parallel.every(Boolean), 'Parallel page loads must retain their verified user context');
    assert.ok(response.headers['Set-Cookie'].some(cookie => cookie.startsWith('__Host-wf_access=')));
    assert.equal(db.tables.get('auth_sessions').get(pair.session.id).refreshHash, require('node:crypto').createHash('sha256').update(pair.refresh_token).digest('hex'));
    await assert.rejects(auth.resolve(request(pair, 'POST'), new Response()), /CSRF/);
    const missingCsrf = request(pair); missingCsrf.headers.cookie = `__Host-wf_refresh=${pair.refresh_token}`;
    assert.equal(await auth.resolve(missingCsrf, new Response()), null);
});

test('absolute and inactivity limits apply to authentication, CSRF, renewal, refresh, introspection and listing without resurrection', async () => {
    const { db, auth } = await fixture({ session: { sessionSeconds: 100, idleTimeoutSeconds: 10 } });
    const pair = await auth.sessions.create('alice');
    const row = db.tables.get('auth_sessions').get(pair.session.id);
    row.lastActiveAt = Date.now() - 10001;
    assert.equal(await auth.sessions.authenticate(pair.auth_token), null);
    assert.equal(await auth.sessions.verifyCsrf(pair.refresh_token, pair.csrf_token, 'refresh'), false);
    assert.equal(await auth.sessions.refresh(pair.refresh_token), null);
    assert.equal(await auth.sessions.renewAccess(pair.refresh_token), null);
    assert.equal(await auth.sessions.inspect(pair.session.id), null);
    assert.deepEqual(await auth.sessions.list('alice'), []);
    await auth.sessions.touch(pair.session);
    assert.ok(row.lastActiveAt < Date.now() - 10000);
    row.lastActiveAt = Date.now(); row.createdAt = Date.now() - 100001;
    assert.equal(await auth.sessions.authenticate(pair.auth_token), null);
    const unlimited = new AuthScope({ ...auth.configuration, session: { ...auth.configuration.session, sessionSeconds: 1000, idleTimeoutSeconds: false } });
    assert.ok(await unlimited.sessions.authenticate(pair.auth_token));
});
