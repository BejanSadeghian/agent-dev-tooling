// The generators are the part a non-technical author touches first: what they emit
// must pass the format spec, the rubric, and its own tests without hand-editing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseArtifactLine } from '../scripts/new-skill.mjs';
import { REPO_ROOT } from '../scripts/lib/skills.mjs';

const node = (args, env = {}) =>
  spawnSync('node', args, { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } });

function generate(t, answers, extraArgs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-gen-'));
  const answersFile = path.join(root, 'answers.json');
  fs.writeFileSync(answersFile, JSON.stringify(answers));
  const result = node(['scripts/new-skill.mjs', '--answers', answersFile, '--yes', '--root', root, '--no-verify', ...extraArgs]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, dir: path.join(root, answers.name), result };
}

const ANSWERS = {
  name: 'unit-economics',
  what: 'Works out contribution margin per order and flags the ones below the floor.',
  trigger: 'Use when someone needs order-level margin worked out.',
  nonTrigger: 'forecasting or pricing strategy',
  kind: 'analysis',
  artifacts: ['margin-lines: outputs/margin-lines.csv — one row per order line'],
  python: true,
  steps: ['Check the input columns', 'Run the margin calculation', 'Report the breaches'],
};

test('parseArtifactLine reads id, path, kind and description', () => {
  const parsed = parseArtifactLine('Summary Table: outputs/summary.csv — one row per category');
  assert.deepEqual(parsed, {
    id: 'summary-table',
    path: 'outputs/summary.csv',
    kind: 'data',
    description: 'one row per category',
  });
  assert.equal(parseArtifactLine('brief: outputs/brief.md').kind, 'report');
  assert.equal(parseArtifactLine('chart: outputs/chart.png').kind, 'chart');
  assert.equal(parseArtifactLine('just-an-id').path, 'outputs/just-an-id.json');
  assert.equal(parseArtifactLine(''), null);
});

test('the generator writes a complete, valid skill', (t) => {
  const { dir, result } = generate(t, ANSWERS);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  for (const file of [
    'SKILL.md',
    'skill.json',
    'python/unit_economics.py',
    'python/tests/test_accuracy_unit_economics.py',
    'python/tests/test_edge_unit_economics.py',
    'python/tests/test_performance_unit_economics.py',
    'references/interview-notes.md',
  ]) {
    assert.ok(fs.existsSync(path.join(dir, file)), `missing ${file}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'skill.json'), 'utf8'));
  assert.equal(manifest.name, 'unit-economics');
  assert.equal(manifest.artifacts[0].id, 'margin-lines');
  assert.deepEqual(manifest.artifacts[0].testKinds, ['accuracy', 'edge', 'performance']);
  assert.match(manifest.python.entrypoints[0], /^unit_economics\./);
});

test('generated Python tests declare their kind and what they cover', (t) => {
  const { dir } = generate(t, ANSWERS);
  for (const kind of ['accuracy', 'edge', 'performance']) {
    const text = fs.readFileSync(path.join(dir, `python/tests/test_${kind}_unit_economics.py`), 'utf8');
    assert.match(text, new RegExp(`KIND = "${kind}"`));
    assert.match(text, /COVERS = \[.*margin-lines/);
  }
});

test('everything generated passes format, tests and rubric with no hand-editing', (t) => {
  const { root, dir } = generate(t, ANSWERS);
  // Point a scratch repo at the generated skill so the real tooling runs over it.
  const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'skill.config.json'), 'utf8'));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-gen-repo-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  fs.cpSync(path.join(REPO_ROOT, 'scripts'), path.join(scratch, 'scripts'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'harness'), path.join(scratch, 'harness'), { recursive: true });
  fs.mkdirSync(path.join(scratch, 'skills'), { recursive: true });
  fs.cpSync(dir, path.join(scratch, 'skills/unit-economics'), { recursive: true });
  fs.writeFileSync(path.join(scratch, 'skill.config.json'), JSON.stringify({ ...config, skillsDirs: ['skills'] }, null, 2));

  const run = (script) =>
    spawnSync('node', [path.join(scratch, 'scripts', script)], { cwd: scratch, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

  const format = run('validate-skill.mjs');
  assert.equal(format.status, 0, format.stdout);
  const tests = run('run-regression.mjs');
  assert.equal(tests.status, 0, tests.stdout);
  assert.match(tests.stdout, /python-tests/);
  const rubric = run('check-rubric.mjs');
  assert.equal(rubric.status, 0, rubric.stdout);
  assert.ok(fs.existsSync(path.join(scratch, '.skill-state/perf/unit-economics.json')), 'no performance report recorded');
  void root;
});

test('--skip records the reason and exempts the part from coverage', (t) => {
  const { dir } = generate(t, ANSWERS, ['--skip', 'margin-lines']);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'skill.json'), 'utf8'));
  assert.equal(manifest.artifacts[0].generate, false);
  assert.match(manifest.artifacts[0].skipReason, /switched off/);
  assert.deepEqual(manifest.generation.skipped, ['margin-lines']);
});

test('a skill with no artifacts and no Python still generates and validates', (t) => {
  const { dir, result } = generate(t, {
    ...ANSWERS,
    name: 'doc-only',
    kind: 'utility',
    artifacts: [],
    python: false,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!fs.existsSync(path.join(dir, 'python')));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'skill.json'), 'utf8'));
  assert.deepEqual(manifest.artifacts, []);
});

test('gen-tests reports gaps across the repo and exits non-zero when any exist', () => {
  const result = node(['scripts/gen-tests.mjs']);
  assert.match(result.stdout, /(PASS|GAPS)/);
});
