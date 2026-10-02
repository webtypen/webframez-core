const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, AuthScope, Request, Response } = require('../dist');
const { database } = require('../test-support/auth-store.cjs');

function fixture() {
    const db = database();
    const user = Object.assign(new Model(), { _id: 'alice', _ref_id: 'central-alice', is_active: true });
    const resource = Object.assign(new Model(), { _id: 'local-environment', _ref_id: 'central-environment' });
    const row = Object.assign(new Model(), { _user: 'central-alice', _env: 'central-environment', internalSecret: 'private' });
    const rows = [row];
    class User extends Model {
        static async objectId(value) { return value; }

        static where(key, operator, value) { return { first: async () => user[key] === value ? user : null }; }
    }
    class Membership extends Model {
        static where(key, operator, value) {
            const filters = [[key, operator, value]];
            return {
                where(key, operator, value) { filters.push([key, operator, value]); return this; },
                async first() { return rows.find(row => filters.every(([key, operator, value]) => value?.$in
                    ? value.$in.includes(row[key]) : operator === '!=' ? row[key] !== value : row[key] === value)) || null; },
            };
        }
    }
    const scope = new AuthScope({ model: User, transport: 'bearer', origin: 'https://api.example',
        session: { database: async () => db, idAdapter: db.idAdapter, allowDynamicEnvironment: true },
        memberships: { environment: { model: Membership, sessionEnvironmentKey: "_ref_id",
            bindings: [{ user: { foreignKey: '_user', localKeys: ['_ref_id'] }, resource: { foreignKey: '_env', localKeys: ['_ref_id', '_id'] } },
                { user: { foreignKey: 'user', localKeys: ['_id'] }, resource: { foreignKey: 'environment', localKeys: ['_id'] } }],
            conditions: [{ field: 'is_deleted', operator: '!=', value: true }, { field: 'is_active', operator: '!=', value: false }],
            resourceConditions: [{ field: 'is_disabled', operator: '!=', value: true }],
        } } });
    const request = token => Object.assign(new Request(), { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    return { db, user, resource, row, scope, request };
}

test('membership joins synchronized and legacy identities, rejects missing IDs and revoked memberships', async () => {
    const { scope, user, row, resource } = fixture();
    assert.equal(await scope.findMembership('environment', user, resource), row);
    row._env = 'someone-else';
    assert.equal(await scope.findMembership('environment', user, resource), null);
    delete row._env; delete row._user;
    row.environment = resource._id; row.user = user._id;
    assert.equal(await scope.findMembership('environment', user, resource), row);
    row.is_deleted = true;
    assert.equal(await scope.findMembership('environment', user, resource), null);
    row.is_deleted = false; row.is_active = false;
    assert.equal(await scope.findMembership('environment', user, resource), null);
    row.is_active = true; resource.is_disabled = true;
    assert.equal(await scope.findMembership('environment', user, resource), null);
    assert.equal(await scope.findMembership('environment', user, new Model()), null);
    assert.equal(await scope.findMembership('environment', { _id: 'alice' }, resource), null);
    await assert.rejects(scope.findMembership('unknown', user, resource), /not configured/);
});

test('membership injection requires this scope authentication; denial clears stale context and snapshots omit memberships', async () => {
    const { scope, user, row, resource, request } = fixture();
    const pair = await scope.establishBearerSession(request(''), user._id, null, resource._ref_id);
    const req = request(pair.auth_token);
    req.auth = { user, session: pair.session };
    assert.equal(await scope.authorizeMembership(req, 'environment', resource), null);
    const auth = await scope.resolve(req);
    assert.equal(await scope.authorizeMembership(req, 'environment', resource), row);
    assert.equal(auth.memberships.environment.resource, resource);
    const otherEnvironment = Object.assign(new Model(), { _id: resource._id, _ref_id: 'different-central-environment' });
    assert.equal(await scope.authorizeMembership(req, 'environment', otherEnvironment), null);
    assert.equal(auth.memberships.environment, undefined);
    assert.equal(await scope.authorizeMembership(req, 'environment', resource), row);
    assert.equal(scope.snapshot(auth).memberships, undefined);
    row.is_deleted = true;
    assert.equal(await scope.authorizeMembership(req, 'environment', resource), null);
    assert.equal(auth.memberships.environment, undefined);
    await scope.sessions.revoke(pair.session.id);
    assert.equal(await scope.resolve(req), null);
});

test('bearer tokens support rotation, reject cookies/query injection, and logout revokes credentials', async () => {
    const { scope, request, user } = fixture();
    const pair = await scope.establishBearerSession(request(''), user._id);
    assert.equal('csrf_token' in pair, false);
    const req = request(pair.auth_token);
    assert.equal((await scope.resolve(req)).user, user);
    assert.equal(await scope.resolve(Object.assign(new Request(), { query: { token: pair.auth_token }, headers: { cookie: `wf_dev_access=${pair.auth_token}` } })), null);
    const refreshed = await scope.sessions.refresh(pair.refresh_token);
    assert.ok(refreshed);
    assert.equal(await scope.resolve(req), null);
    assert.ok(await scope.resolve(request(refreshed.auth_token)));
    await scope.logoutBearer(request(refreshed.auth_token));
    assert.equal(await scope.resolve(request(refreshed.auth_token)), null);
    assert.equal(await scope.sessions.refresh(refreshed.refresh_token), null);
});

test('bearer hooks block creation and logout; session policy runs on creation and authentication', async () => {
    const { scope, request, user } = fixture();
    scope.configuration.beforeLogin = () => { throw new Error('blocked'); };
    await assert.rejects(scope.establishBearerSession(request(''), user._id), /blocked/);
    delete scope.configuration.beforeLogin;
    const pair = await scope.establishBearerSession(request(''), user._id);
    scope.configuration.beforeLogout = () => { throw new Error('blocked'); };
    await assert.rejects(scope.logoutBearer(request(pair.auth_token)), /blocked/);
    assert.ok(await scope.resolve(request(pair.auth_token)));
    scope.configuration.isSessionAllowed = () => false;
    assert.equal(await scope.resolve(request(pair.auth_token)), null);
    await assert.rejects(scope.establishBearerSession(request(''), user._id), /not allowed/);
});

test('dynamic session environments are explicitly enabled and fixed environments stay isolated', async () => {
    const { scope, request, user, resource } = fixture();
    const pair = await scope.establishBearerSession(request(''), user._id, null, resource._ref_id);
    assert.equal(pair.session.environment, resource._ref_id);
    const db = database();
    const { SessionAuth } = require('../dist');
    const fixed = new SessionAuth({ issuer: 'https://api.example', audience: 'fixed', environment: 'fixed-environment',
        isSessionAllowed: () => true, database: async () => db, idAdapter: db.idAdapter });
    await assert.rejects(fixed.create('alice', null, 'other-environment'), /not enabled/);
    assert.equal((await fixed.create('alice')).session.environment, 'fixed-environment');
});
