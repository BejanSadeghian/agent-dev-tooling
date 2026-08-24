// Scaffold for a deterministic test file (node:test — swap in the repo's runner).
// Every test: one behaviour, named for the behaviour, fixed inputs, no clock, no network.
import assert from 'node:assert/strict';
import test from 'node:test';

export const SEED = 42; // recorded so the fixture below can be regenerated:
// node scripts/datagen.mjs --spec fixtures/users.spec.json --seed 42 --rows 100 --out fixtures/users.json

test('SUBJECT does EXPECTED when CONDITION', () => {
  const input = { field: 'value' };
  const result = subjectUnderTest(input);
  assert.equal(result.field, 'value');
});

test('SUBJECT rejects BOUNDARY', () => {
  assert.throws(() => subjectUnderTest({ field: '' }), /field is required/);
});

// Regression — reported DATE (LINK). Proven to fail on the unfixed code with:
// "TypeError: cannot read properties of null"
test('SUBJECT keeps SYMPTOM when the second removal happens', () => {
  assert.equal(subjectUnderTest({ field: null }).field, undefined);
});

function subjectUnderTest(input) {
  // Replace with the import under test.
  return { field: input.field ?? undefined };
}
