// The bundled generator is a shipped dependency of the test-generator skill, so it
// carries tooling-level tests as well as the skill's own regression cases.
import assert from 'node:assert/strict';
import test from 'node:test';
import { generate, rng, serialise } from '../../.github/skills/test-generator/scripts/datagen.mjs';

const SPEC = {
  name: 'users',
  fields: [
    { name: 'id', type: 'uuid' },
    { name: 'age', type: 'int', min: 18, max: 90 },
    { name: 'role', type: 'enum', values: ['admin', 'viewer'] },
    { name: 'bio', type: 'text', words: 3, nullable: true, nullRate: 0.5 },
  ],
};

test('the same seed produces identical rows', () => {
  assert.deepEqual(generate(SPEC, { seed: 7, rows: 20 }), generate(SPEC, { seed: 7, rows: 20 }));
});

test('a different seed produces different rows', () => {
  assert.notDeepEqual(generate(SPEC, { seed: 7, rows: 20 }), generate(SPEC, { seed: 8, rows: 20 }));
});

test('generated values respect the declared bounds and enums', () => {
  for (const row of generate(SPEC, { seed: 3, rows: 100 })) {
    assert.ok(row.age >= 18 && row.age <= 90, `age out of range: ${row.age}`);
    assert.ok(['admin', 'viewer'].includes(row.role));
    assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test('nullable fields do produce nulls, non-nullable ones never do', () => {
  const rows = generate(SPEC, { seed: 11, rows: 200 });
  assert.ok(rows.some((r) => r.bio === null), 'expected at least one null bio');
  assert.ok(rows.every((r) => r.age !== null));
});

test('edge-case rows include the declared boundaries', () => {
  const rows = generate({ name: 'x', fields: [{ name: 'age', type: 'int', min: 18, max: 90 }] }, { seed: 1, rows: 0, edgeCases: true });
  const ages = rows.map((r) => r.age);
  assert.deepEqual(ages.sort((a, b) => a - b), [0, 17, 18, 90, 91]); // min, min-1, max, max+1, zero
});

test('an unknown field type is an explicit error', () => {
  assert.throws(() => generate({ name: 'x', fields: [{ name: 'a', type: 'mystery' }] }, { seed: 1, rows: 1 }), /unknown field type "mystery"/);
});

test('a ref field draws only from its pool, and an empty pool is an error', () => {
  const spec = { name: 'orders', fields: [{ name: 'user_id', type: 'ref', from: 'users.id' }] };
  const rows = generate(spec, { seed: 2, rows: 30, refs: { 'users.id': ['a', 'b', 'c'] } });
  assert.ok(rows.every((r) => ['a', 'b', 'c'].includes(r.user_id)));
  assert.throws(() => generate(spec, { seed: 2, rows: 1, refs: {} }), /ref pool "users\.id" is empty/);
});

test('csv escapes commas, quotes and newlines', () => {
  const spec = { name: 'x', fields: [{ name: 'note', type: 'string' }] };
  const csv = serialise([{ note: 'a,b"c\nd' }, { note: 'plain' }], 'csv', spec);
  assert.equal(csv, 'note\n"a,b""c\nd"\nplain\n');
});

test('ndjson emits one parseable object per line', () => {
  const out = serialise([{ a: 1 }, { a: 2 }], 'ndjson', { fields: [{ name: 'a' }] });
  assert.deepEqual(out.trim().split('\n').map((l) => JSON.parse(l)), [{ a: 1 }, { a: 2 }]);
});

test('an unknown format is an explicit error', () => {
  assert.throws(() => serialise([], 'xml', { fields: [] }), /unknown format "xml"/);
});

test('the PRNG is a pure function of its seed', () => {
  const a = rng(99);
  const b = rng(99);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});
