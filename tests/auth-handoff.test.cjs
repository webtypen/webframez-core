const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthHandoff } = require('../dist');
const { database } = require('../test-support/auth-store.cjs');

function fixture() {
    const db = database();
    return { db, handoff: new AuthHandoff({ secret: 'strong-secret-'.repeat(4), audience: 'instance', database: async () => db }) };
}

test('handoffs are hashed, encrypted, audience-bound and atomically consumed once', async () => {
    const { db, handoff } = fixture();
    const code = await handoff.create({ refresh_token: 'sensitive-refresh' });
    assert.doesNotMatch(JSON.stringify([...db.tables.get('auth_handoffs').values()]), /sensitive-refresh/);
    assert.equal(db.tables.get('auth_handoffs').has(code), false);
    const other = new AuthHandoff({ secret: 'strong-secret-'.repeat(4), audience: 'other-instance', database: async () => db });
    assert.equal(await other.consume(code), null);
    const results = await Promise.all([handoff.consume(code), handoff.consume(code)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.deepEqual(results.find(Boolean), { refresh_token: 'sensitive-refresh' });
    assert.equal([...db.tables.get('auth_handoffs').values()][0].payload, '');
});

test('expired, malformed and tampered handoffs fail closed', async t => {
    const { db, handoff } = fixture();
    assert.equal(await handoff.consume({ $ne: null }), null);
    const code = await handoff.create({ ok: true });
    const row = [...db.tables.get('auth_handoffs').values()][0];
    row.payload = Buffer.from('tampered').toString('base64');
    await assert.rejects(handoff.consume(code));
    const expired = await handoff.create({ ok: true });
    const now = Date.now();
    t.mock.method(Date, 'now', () => now + 31000);
    assert.equal(await handoff.consume(expired), null);
});
