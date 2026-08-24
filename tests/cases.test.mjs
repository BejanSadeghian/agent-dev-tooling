import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runCase, validateCaseShape } from '../scripts/lib/cases.mjs';
import { makeRepo } from './helpers.mjs';

test('files_exist passes when every path is present and fails when one is not', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runCase({ type: 'files_exist', paths: ['SKILL.md'] }, repo.skillDir).passed, true);
  const missing = runCase({ type: 'files_exist', paths: ['SKILL.md', 'nope.md'] }, repo.skillDir);
  assert.equal(missing.passed, false);
  assert.match(missing.message, /nope\.md/);
});

test('contains matches regexes against a file in the skill', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runCase({ type: 'contains', file: 'SKILL.md', patterns: ['## Workflow'] }, repo.skillDir).passed, true);
  assert.equal(runCase({ type: 'contains', file: 'SKILL.md', patterns: ['## Nope'] }, repo.skillDir).passed, false);
});

test('not_contains fails when a forbidden pattern is present', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runCase({ type: 'not_contains', file: 'SKILL.md', patterns: ['## Nope'] }, repo.skillDir).passed, true);
  assert.equal(runCase({ type: 'not_contains', file: 'SKILL.md', patterns: ['## Workflow'] }, repo.skillDir).passed, false);
});

test('a missing file is a failed case, not a crash', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const result = runCase({ type: 'contains', file: 'gone.md', patterns: ['x'] }, repo.skillDir);
  assert.equal(result.passed, false);
  assert.match(result.message, /no such file/);
});

test('a path escaping the skill directory fails', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const result = runCase({ type: 'contains', file: '../../../etc/hosts', patterns: ['x'] }, repo.skillDir);
  assert.equal(result.passed, false);
  assert.match(result.message, /escapes skill dir|no such file/);
});

test('json_shape checks dotted key paths', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  fs.writeFileSync(path.join(repo.skillDir, 'data.json'), JSON.stringify({ a: { b: 1 } }));
  assert.equal(runCase({ type: 'json_shape', file: 'data.json', requiredKeys: ['a.b'] }, repo.skillDir).passed, true);
  assert.equal(runCase({ type: 'json_shape', file: 'data.json', requiredKeys: ['a.c'] }, repo.skillDir).passed, false);
});

test('command cases honour exit code and stdout expectations', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runCase({ type: 'command', cmd: 'echo hello' , expectStdout: ['hello'] }, repo.skillDir).passed, true);
  assert.equal(runCase({ type: 'command', cmd: 'echo hello', expectStdout: ['goodbye'] }, repo.skillDir).passed, false);
  assert.equal(runCase({ type: 'command', cmd: 'exit 3', expectExitCode: 3 }, repo.skillDir).passed, true);
  assert.equal(runCase({ type: 'command', cmd: 'exit 1' }, repo.skillDir).passed, false);
});

test('command cases run from the skill directory', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.equal(runCase({ type: 'command', cmd: 'test -f SKILL.md' }, repo.skillDir).passed, true);
});

test('validateCaseShape reports unknown types and missing fields', () => {
  assert.match(validateCaseShape({ type: 'vibes' })[0], /unknown case type/);
  assert.match(validateCaseShape({ type: 'contains', file: 'a' })[0], /requires field "patterns"/);
  assert.deepEqual(validateCaseShape({ type: 'contains', file: 'a', patterns: [] }), []);
});
