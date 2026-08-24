// The lint is small on purpose, so each rule has to earn its place — and prove it
// fires. These drive the rules over throwaway files rather than over this repo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RULES, collectFiles, lint } from '../scripts/lint.mjs';

const rule = (id) => {
  const found = RULES.find((r) => r.id === id);
  assert.ok(found, `no rule "${id}"`);
  return found;
};

const run = (id, rel, text) => (rule(id).applies(rel) ? rule(id).check({ rel, text }) : []);

function scratch(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-lint-'));
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('final-newline fires on a file that does not end with one', () => {
  assert.deepEqual(run('final-newline', 'a.mjs', 'const a = 1;\n'), []);
  assert.match(run('final-newline', 'a.mjs', 'const a = 1;')[0], /does not end with a newline/);
});

test('no-crlf fires on Windows line endings', () => {
  assert.deepEqual(run('no-crlf', 'a.py', 'x = 1\n'), []);
  assert.match(run('no-crlf', 'a.py', 'x = 1\r\n')[0], /CRLF/);
});

test('no-trailing-whitespace names the line', () => {
  assert.match(run('no-trailing-whitespace', 'a.mjs', 'const a = 1;\nconst b = 2; \n')[0], /line 2/);
});

test('no-tabs fires on tab indentation and ignores tabs mid-line', () => {
  assert.match(run('no-tabs', 'a.py', 'def f():\n\treturn 1\n')[0], /line 2/);
  assert.deepEqual(run('no-tabs', 'a.py', 'x = "a\tb"\n'), []);
});

test('no-unfinished-markers fires on code but exempts tests and the rule file itself', () => {
  assert.match(run('no-unfinished-markers', 'scripts/thing.mjs', '// TODO finish\n')[0], /TODO/);
  assert.deepEqual(run('no-unfinished-markers', 'tests/a.test.mjs', '// TODO as a fixture\n'), []);
  assert.deepEqual(run('no-unfinished-markers', 'scripts/lint.mjs', '// TODO\n'), []);
});

test('cli-has-main-guard fires only on a script that defines main() without the guard', () => {
  const guarded = 'function main() {}\nif (import.meta.url === `file://${process.argv[1]}`) process.exit(main());\n';
  assert.deepEqual(run('cli-has-main-guard', 'scripts/a.mjs', guarded), []);
  assert.match(run('cli-has-main-guard', 'scripts/a.mjs', 'function main() {}\nmain();\n')[0], /no import\.meta\.url/);
  assert.deepEqual(run('cli-has-main-guard', 'scripts/a.mjs', 'export const x = 1;\n'), []);
  assert.deepEqual(run('cli-has-main-guard', 'scripts/lib/a.mjs', 'function main() {}\n'), []);
});

test('libraries-do-not-print fires in lib/ but not in the CLIs or the reporter', () => {
  assert.match(run('libraries-do-not-print', 'scripts/lib/a.mjs', 'console.log("x");\n')[0], /console output/);
  assert.deepEqual(run('libraries-do-not-print', 'scripts/lib/report.mjs', 'console.log("x");\n'), []);
  assert.deepEqual(run('libraries-do-not-print', 'scripts/cli.mjs', 'console.log("x");\n'), []);
  assert.deepEqual(run('libraries-do-not-print', 'scripts/lib/a.mjs', 'const s = fake.console.log;\n'), []);
});

test('harness-is-deterministic fires on clock and randomness in the harness', () => {
  assert.match(run('harness-is-deterministic', 'harness/skillharness/perf.py', 'import random\nrandom.random()\n')[0], /not reproducible/);
  assert.match(run('harness-is-deterministic', 'harness/skillharness/perf.py', 'time.time()\n')[0], /time\.time/);
  assert.deepEqual(run('harness-is-deterministic', 'harness/skillharness/perf.py', 'time.perf_counter()\n'), []);
  assert.deepEqual(run('harness-is-deterministic', 'examples/x/python/a.py', 'import random\nrandom.random()\n'), []);
});

test('json-parses reports a broken manifest', () => {
  assert.deepEqual(run('json-parses', 'skill.json', '{"a": 1}\n'), []);
  assert.match(run('json-parses', 'skill.json', '{ not json')[0], /invalid JSON/);
});

test('lint() reports a broken .mjs as a syntax error', (t) => {
  const root = scratch(t, { 'broken.mjs': 'const = ;\n' });
  const findings = lint(root);
  assert.ok(findings.some((f) => /syntax/.test(f.message) && f.where === 'broken.mjs'), JSON.stringify(findings));
});

test('lint() reports a broken shell script and broken Python', (t) => {
  const root = scratch(t, { 'a.sh': 'if [ 1 -eq 1 ]; then\n', 'a.py': 'def f(:\n' });
  const messages = lint(root).map((f) => f.message).join('\n');
  assert.match(messages, /syntax/);
  assert.match(messages, /python syntax/);
});

test('lint() is clean on a well-formed tree and skips node_modules', (t) => {
  const root = scratch(t, {
    'ok.mjs': 'export const a = 1;\n',
    'ok.py': 'x = 1\n',
    'node_modules/junk.mjs': 'const = ;\n',
  });
  assert.deepEqual(lint(root), []);
  assert.deepEqual(collectFiles(root).map((f) => path.basename(f)).sort(), ['ok.mjs', 'ok.py']);
});

test('this repo passes its own lint', () => {
  assert.deepEqual(lint(), []);
});
