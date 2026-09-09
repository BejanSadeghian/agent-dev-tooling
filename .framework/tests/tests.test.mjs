import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runTest, validateTestShape } from '../scripts/lib/tests.mjs';
import { makeRepo } from './helpers.mjs';

test('files_exist passes when every path is present and fails when one is not', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runTest({ type: 'files_exist', paths: ['SKILL.md'] }, repo.skillDir).passed, true);
  const missing = runTest({ type: 'files_exist', paths: ['SKILL.md', 'nope.md'] }, repo.skillDir);
  assert.equal(missing.passed, false);
  assert.match(missing.message, /nope\.md/);
});

test('contains matches regexes against a file in the skill', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runTest({ type: 'contains', file: 'SKILL.md', patterns: ['## Workflow'] }, repo.skillDir).passed, true);
  assert.equal(runTest({ type: 'contains', file: 'SKILL.md', patterns: ['## Nope'] }, repo.skillDir).passed, false);
});

test('not_contains fails when a forbidden pattern is present', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runTest({ type: 'not_contains', file: 'SKILL.md', patterns: ['## Nope'] }, repo.skillDir).passed, true);
  assert.equal(runTest({ type: 'not_contains', file: 'SKILL.md', patterns: ['## Workflow'] }, repo.skillDir).passed, false);
});

test('a missing file is a failed test, not a crash', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const result = runTest({ type: 'contains', file: 'gone.md', patterns: ['x'] }, repo.skillDir);
  assert.equal(result.passed, false);
  assert.match(result.message, /no such file/);
});

test('a path escaping the skill directory fails', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const result = runTest({ type: 'contains', file: '../../../etc/hosts', patterns: ['x'] }, repo.skillDir);
  assert.equal(result.passed, false);
  assert.match(result.message, /escapes skill dir|no such file/);
});

test('json_shape checks dotted key paths', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  fs.writeFileSync(path.join(repo.skillDir, 'data.json'), JSON.stringify({ a: { b: 1 } }));
  assert.equal(runTest({ type: 'json_shape', file: 'data.json', requiredKeys: ['a.b'] }, repo.skillDir).passed, true);
  assert.equal(runTest({ type: 'json_shape', file: 'data.json', requiredKeys: ['a.c'] }, repo.skillDir).passed, false);
});

test('command tests honour exit code and stdout expectations', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runTest({ type: 'command', cmd: 'echo hello' , expectStdout: ['hello'] }, repo.skillDir).passed, true);
  assert.equal(runTest({ type: 'command', cmd: 'echo hello', expectStdout: ['goodbye'] }, repo.skillDir).passed, false);
  assert.equal(runTest({ type: 'command', cmd: 'exit 3', expectExitCode: 3 }, repo.skillDir).passed, true);
  assert.equal(runTest({ type: 'command', cmd: 'exit 1' }, repo.skillDir).passed, false);
});

test('command tests run from the skill directory', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runTest({ type: 'command', cmd: 'test -f SKILL.md' }, repo.skillDir).passed, true);
});

test('validateTestShape reports unknown types and missing fields', () => {
  assert.match(validateTestShape({ type: 'vibes' })[0], /unknown test type/);
  assert.match(validateTestShape({ type: 'contains', file: 'a' })[0], /requires field "patterns"/);
  assert.deepEqual(validateTestShape({ type: 'contains', file: 'a', patterns: [] }), []);
});

test('artifact runs the entry on input and deep-compares with expected', (t) => {
  const repo = makeRepo({
    scripts: {
      'double.py': 'def build(rows):\n    return {"records": [{"n": r["n"] * 2} for r in rows], "deviations": []}\n',
    },
  });
  t.after(repo.cleanup);
  const good = {
    type: 'artifact',
    entry: 'scripts/double.py:build',
    input: [{ n: 2 }, { n: 3 }],
    expected: { records: [{ n: 4 }, { n: 6 }], deviations: [] },
  };
  assert.equal(runTest(good, repo.skillDir).passed, true);
  const bad = { ...good, expected: { records: [{ n: 4 }, { n: 7 }], deviations: [] } };
  const failed = runTest(bad, repo.skillDir);
  assert.equal(failed.passed, false);
  assert.match(failed.message, /\$\.records\[1\]\.n/);
});

test('artifact rejects a bad entry and reports a raising entry', (t) => {
  const repo = makeRepo({
    scripts: { 'boom.py': 'def build(rows):\n    raise ValueError("row 0: nope")\n' },
  });
  t.after(repo.cleanup);
  const malformed = runTest({ type: 'artifact', entry: 'no-colon', input: [], expected: {} }, repo.skillDir);
  assert.equal(malformed.passed, false);
  assert.match(malformed.message, /must be "scripts/);
  const raising = runTest(
    { type: 'artifact', entry: 'scripts/boom.py:build', input: [], expected: {} },
    repo.skillDir,
  );
  assert.equal(raising.passed, false);
  assert.match(raising.message, /row 0: nope/);
});
