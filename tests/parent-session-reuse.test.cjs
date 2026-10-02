const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionAuth } = require('../dist');
const { database } = require('../test-support/auth-store.cjs');
const parent = { issuer: 'https://website.example', sessionId: 'parent-session' };

function setup(extra = {}) {
 const db = database();
 const options = { issuer: 'https://api.example', audience: 'manager', allowDynamicEnvironment: true,
  parentSessions: { mode: 'reuse', secret: 'test-server-secret-'.repeat(4) },
  isSessionAllowed: async () => true, idAdapter: db.idAdapter, database: async () => db, ...extra };
 return { db, auth: new SessionAuth(options), options };
}

test('concurrent reopen reuses exactly one child and current credentials', async () => {
 const { auth, db } = setup();
 const pairs = await Promise.all(Array.from({ length: 15 }, () => auth.create('user', parent, 'environment')));
 assert.equal(new Set(pairs.map(pair => pair.session.id)).size, 1);
 assert.equal(new Set(pairs.map(pair => pair.auth_token)).size, 1);
 assert.equal(new Set(pairs.map(pair => pair.refresh_token)).size, 1);
 assert.equal(db.tables.get('auth_sessions').size, 1);
 assert.equal(pairs.filter(pair => !pair.reused).length, 1);
 const row = [...db.tables.get('auth_sessions').values()][0];
 assert.ok(!JSON.stringify(row).includes(pairs[0].refresh_token));
 assert.ok(!('id' in row)); assert.ok(!('subject' in row));
 const rotated = await auth.refresh(pairs[0].refresh_token);
 const reopened = await auth.create('user', parent, 'environment');
 assert.equal(reopened.auth_token, rotated.auth_token);
 assert.equal(reopened.refresh_token, rotated.refresh_token);
 assert.equal(reopened.session.createdAt, pairs[0].session.createdAt);
 assert.ok(await auth.authenticate(rotated.auth_token));
});

test('different users, parents, scopes and environments retain isolated sessions', async () => {
 const { auth, options } = setup();
 const sessions = [await auth.create('user', parent, 'a'), await auth.create('user', parent, 'b'),
  await auth.create('other', parent, 'a'), await auth.create('user', { ...parent, sessionId: 'other-parent' }, 'a'),
  await new SessionAuth({ ...options, scope: 'other' }).create('user', parent, 'a')];
 assert.equal(new Set(sessions.map(pair => pair.session.id)).size, 5);
});

test('child logout permits a new linked generation; parent denial blocks all access and refresh', async () => {
 let parentActive = true;
 const { auth, db } = setup({ isSessionAllowed: async () => parentActive });
 const first = await auth.create('user', parent, 'a');
 await auth.revoke(first.session.id);
 const next = await auth.create('user', parent, 'a');
 assert.notEqual(next.session.id, first.session.id); assert.equal(next.reused, false);
 parentActive = false;
 assert.equal(await auth.authenticate(next.auth_token), null);
 assert.equal(await auth.refresh(next.refresh_token), null);
 await assert.rejects(auth.create('user', parent, 'a'), /not allowed/);
 assert.equal(db.tables.get('auth_sessions').size, 2);
});

test('expired access renews without consuming refresh, and parent expiry caps the child', async () => {
 const { auth, db } = setup(); const expiry = Date.now() + 120000;
 const first = await auth.create('user', parent, 'a', expiry);
 assert.equal(first.session.expiresAt, expiry); assert.ok(first.auth_expires_at <= expiry);
 await db.collection('auth_sessions').updateOne({ _id: first.session.id }, { $set: { accessExpiresAt: Date.now() - 1 } });
 const renewed = await auth.create('user', parent, 'a', expiry);
 assert.equal(renewed.refresh_token, first.refresh_token);
 assert.notEqual(renewed.auth_token, first.auth_token);
 assert.ok(await auth.authenticate(renewed.auth_token));
 assert.ok(await auth.refresh(first.refresh_token));
});

test('default mode and non-parent logins retain independent sessions; secrets fail closed', async () => {
 const { auth, options } = setup();
 assert.notEqual((await auth.create('user')).session.id, (await auth.create('user')).session.id);
 const independent = new SessionAuth({ ...options, parentSessions: undefined });
 assert.notEqual((await independent.create('user', parent, 'a')).session.id, (await independent.create('user', parent, 'a')).session.id);
 assert.throws(() => new SessionAuth({ ...options, parentSessions: { mode: 'reuse' } }), /strong server secret/);
 const first = await auth.create('user', parent, 'a');
 const changed = new SessionAuth({ ...options, parentSessions: { mode: 'reuse', secret: 'changed-secret-'.repeat(4) } });
 await assert.rejects(changed.create('user', parent, 'a'), /credentials have changed/);
 assert.ok(await auth.authenticate(first.auth_token));
});
