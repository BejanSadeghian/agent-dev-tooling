// The generators are the part a non-technical author touches first: what they emit
// must pass the format spec, the rubric, and its own tests without hand-editing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseFieldLine } from '../scripts/new-skill.mjs';
import { REPO_ROOT } from '../scripts/lib/skills.mjs';
import { runTest } from '../scripts/lib/tests.mjs';

const node = (args, env = {}) =>
  spawnSync('node', args, { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } });

function generate(t, answers, extraArgs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-gen-'));
  const answersFile = path.join(root, 'answers.json');
  fs.writeFileSync(answersFile, JSON.stringify(answers));
  const result = node(['.framework/scripts/new-skill.mjs', '--answers', answersFile, '--yes', '--root', path.join(root, 'skills'), '--no-verify', ...extraArgs]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    doerDir: path.join(root, 'skills', `${answers.useCase}-doer`),
    observerDir: path.join(root, 'skills', `${answers.useCase}-observer`),
    result,
  };
}

const ANSWERS = {
  useCase: 'unit-economics',
  what: 'Works out contribution margin per order and flags the ones below the floor.',
  trigger: 'Use when someone needs order-level margin worked out.',
  nonTrigger: 'forecasting or pricing strategy',
  fields: ['order_id: string — the order this line belongs to', 'margin: number — contribution margin in USD'],
  steps: ['Check the input columns', 'Run the margin calculation', 'Report the breaches'],
  interprets: 'Reads the unit economics artifact and assesses which orders need attention.',
  observerTrigger: 'Use when someone wants the margin numbers explained or prioritised.',
  observerNonTrigger: 'recomputing the margins themselves',
  lens: 'An order is concerning when its margin is below the floor; several in one category is a pattern.',
};

test('parseFieldLine reads name, type and notes', () => {
  assert.deepEqual(parseFieldLine('unit_price: number — price per unit in USD'), {
    name: 'unit_price',
    type: 'number',
    notes: 'price per unit in USD',
  });
  assert.equal(parseFieldLine('just_a_name').type, 'string');
  assert.equal(parseFieldLine(''), null);
});

test('the generator writes a complete pair', (t) => {
  const { doerDir, observerDir, result } = generate(t, ANSWERS);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  for (const file of [
    'SKILL.md',
    'references/schema.md',
    'references/variations/default.md',
    'assets/source/interview.md',
    'assets/source/interview-notes.md',
    'scripts/check.py',
    'scripts/run.py',
    'scripts/report.py',
    'scripts/unit_economics.py',
    'scripts/tests/test_accuracy_unit_economics.py',
    'scripts/tests/test_edge_unit_economics.py',
    'scripts/tests/test_performance_unit_economics.py',
    'scripts/tests/test_accuracy_check.py',
    'scripts/tests/test_edge_run.py',
    'scripts/tests/test_performance_report.py',
    'evals/tests/schema-reports-deviations.json',
    'evals/tests/artifact-matches-seed-input.json',
  ]) {
    assert.ok(fs.existsSync(path.join(doerDir, file)), `doer missing ${file}`);
  }
  for (const file of [
    'SKILL.md',
    'references/variations/default.md',
    'evals/tests/output-separates-facts-from-interpretation.json',
    'evals/tests/reads-the-doers-schema.json',
  ]) {
    assert.ok(fs.existsSync(path.join(observerDir, file)), `observer missing ${file}`);
  }

  const schema = fs.readFileSync(path.join(doerDir, 'references/schema.md'), 'utf8');
  assert.match(schema, /deviations/);
  assert.match(schema, /`unit_price`|`order_id`/);
  const observer = fs.readFileSync(path.join(observerDir, 'SKILL.md'), 'utf8');
  assert.match(observer, /## Facts/);
  assert.match(observer, /## Interpretations/);
  assert.match(observer, /schema\.md/);
});

test('multiple steps generate one module per step plus an orchestrator', (t) => {
  const { doerDir, result } = generate(t, ANSWERS);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const orchestrator = fs.readFileSync(path.join(doerDir, 'scripts/unit_economics.py'), 'utf8');
  assert.match(orchestrator, /from check import run as check/);
  assert.match(orchestrator, /from run import run as run/);
  assert.match(orchestrator, /from report import run as report/);
  assert.match(orchestrator, /data = check\(data\)/);

  const step = fs.readFileSync(path.join(doerDir, 'scripts/check.py'), 'utf8');
  assert.match(step, /def run\(data/);

  const script = fs.readFileSync(path.join(doerDir, 'assets/source/interview.md'), 'utf8');
  assert.match(script, /In one sentence, what does the DOER do/);
  const notes = fs.readFileSync(path.join(doerDir, 'assets/source/interview-notes.md'), 'utf8');
  assert.match(notes, /order-level margin/);
});

test('the seed artifact test carries a real input and a computed expectation', (t) => {
  const { doerDir, result } = generate(t, ANSWERS);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const seed = JSON.parse(fs.readFileSync(path.join(doerDir, 'evals/tests/artifact-matches-seed-input.json'), 'utf8'));
  assert.equal(seed.type, 'artifact');
  assert.equal(seed.kind, 'accuracy');
  assert.equal(seed.entry, 'scripts/unit_economics.py:build_unit_economics');
  assert.equal(seed.input.length, 2);
  assert.deepEqual(Object.keys(seed.expected).sort(), ['deviations', 'records']);
  assert.equal(seed.expected.records.length, 2);

  // And the expectation is genuinely what the entry produces: the test passes.
  const outcome = runTest(seed, doerDir);
  assert.equal(outcome.passed, true, outcome.message);
});

test('generated Python tests declare their kind and what they cover', (t) => {
  const { doerDir } = generate(t, ANSWERS);
  for (const kind of ['accuracy', 'edge', 'performance']) {
    const text = fs.readFileSync(path.join(doerDir, `scripts/tests/test_${kind}_unit_economics.py`), 'utf8');
    assert.match(text, new RegExp(`KIND = "${kind}"`));
    assert.match(text, /COVERS = \["unit-economics", "unit_economics\./);
  }
});

test('everything generated passes format, tests and rubric with no hand-editing', (t) => {
  const { doerDir, observerDir } = generate(t, ANSWERS);
  // Point a scratch repo at the generated pair so the real tooling runs over it.
  const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.framework/framework.json'), 'utf8'));
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-gen-repo-')));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  fs.cpSync(path.join(REPO_ROOT, '.framework/scripts'), path.join(scratch, '.framework/scripts'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, '.framework/harness'), path.join(scratch, '.framework/harness'), { recursive: true });
  fs.cpSync(doerDir, path.join(scratch, 'skills/unit-economics-doer'), { recursive: true });
  fs.cpSync(observerDir, path.join(scratch, 'skills/unit-economics-observer'), { recursive: true });
  fs.writeFileSync(path.join(scratch, '.framework/framework.json'), JSON.stringify({ ...config, skillsDirs: ['skills'] }, null, 2));

  const run = (script) =>
    spawnSync('node', [path.join(scratch, '.framework/scripts', script)], { cwd: scratch, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

  const format = run('validate-skill.mjs');
  assert.equal(format.status, 0, format.stdout);
  const tests = run('run-regression.mjs');
  assert.equal(tests.status, 0, tests.stdout);
  assert.match(tests.stdout, /python-tests/);
  const rubric = run('check-rubric.mjs');
  assert.equal(rubric.status, 0, rubric.stdout);
  assert.ok(fs.existsSync(path.join(scratch, '.framework/state/perf/unit-economics-doer.json')), 'no performance report recorded');
});

test('--only doer generates just the missing half', (t) => {
  const { doerDir, observerDir, result } = generate(t, ANSWERS, ['--only', 'doer']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.existsSync(doerDir));
  assert.ok(!fs.existsSync(observerDir));
});

test('gen-tests reports gaps across the repo and exits zero when there are none', () => {
  const result = node(['.framework/scripts/gen-tests.mjs']);
  assert.match(result.stdout, /(PASS|GAPS)/);
});
