const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, ModelAuth, Request, Response } = require('../dist');
const { database } = require('../test-support/auth-store.cjs');

async function fixture() {
    const db = database();
    let user, queries = 0;
    class User extends Model {
        __hidden = ['password', 'activation_token'];

        static async objectId(value) { return value; }

        static where(key, operator, value) {
            queries++;
            return { first: async () => user[key] === value ? user : null };
        }
    }
    user = Object.assign(new User(), { _id: 'alice', email: 'alice@example.test', roles: ['member'], password: 'HASH', activation_token: 'ACTIVATION', internalMarker: 'PRIVATE', is_active: true });
    const auth = new ModelAuth({ model: User, origin: 'https://site.example', session: { database: async () => db }, publicUserFields: ['_id', 'email', 'roles', 'password', 'activation_token'] });
    const response = new Response();
    await auth.establishSession('alice', response);
    const cookies = Object.fromEntries(response.headers['Set-Cookie'].map(value => value.split(';')[0].split('=')));
    const req = () => Object.assign(new Request(), { headers: { cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ') } });
    return { user, auth, req, cookies, queries: () => queries };
}

test('request auth loads the actual Model once, and browser snapshots exclude hidden credentials', async () => {
    const { user, auth, req, queries } = await fixture();
    const before = queries(), request = req();
    const result = await auth.resolve(request);
    assert.equal(queries() - before, 1);
    assert.equal(result.user, user);
    assert.ok(result.user instanceof Model);
    assert.equal(request.auth, result);
    assert.equal(JSON.stringify(request).includes('HASH'), false);
    const snapshot = auth.snapshot(result);
    assert.deepEqual(snapshot.user, { _id: 'alice', email: 'alice@example.test', roles: ['member'] });
    assert.doesNotMatch(JSON.stringify(snapshot), /HASH|ACTIVATION|PRIVATE|password|activation_token/);
});

test('auth clears injected values, checks revocation and inactivity, and never skips mutation CSRF', async () => {
    const { auth, req, user } = await fixture();
    const request = req();
    request.auth = { user: { _id: 'mallory' }, session: {} };
    const current = await auth.resolve(request);
    assert.equal(current.user._id, 'alice');
    request.method = 'POST';
    await assert.rejects(auth.resolve(request), /origin/);
    assert.equal(request.auth, null);
    request.method = 'GET';
    user.is_active = false;
    assert.equal(await auth.resolve(request), null);
    user.is_active = true;
    await auth.sessions.revoke(current.session.id);
    assert.equal(await auth.resolve(request), null);
});

test('cookie resolver and optional/required middleware share the same auth context', async () => {
    const { auth, cookies } = await fixture();
    assert.equal((await auth.resolveCookies(cookies)).user._id, 'alice');
    for (const required of [false, true]) {
        const response = new Response();
        let next = false, rejected = false;
        await auth.middleware({ required })(() => next = true, () => rejected = true, new Request(), response);
        assert.equal(next, !required);
        assert.equal(rejected, required);
        assert.equal(response.statusCode, required ? 401 : 200);
    }
});
