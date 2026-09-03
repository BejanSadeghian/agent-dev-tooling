// What ships is not what we develop with: provenance and workshop evals stay
// home. This pins the boundary between the two.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { copySkill } from '../scripts/publish.mjs';

test('publish ships the skill without its development-only provenance', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const src = path.join(root, 'src/margin-doer');
  const files = {
    'SKILL.md': '# skill',
    'references/schema.md': '# schema with deviations',
    'references/variations/default.md': '# variation',
    'references/source-material/authors-runbook.md': 'raw notes',
    'references/interview-notes.md': 'answers',
    'scripts/margin.py': 'x = 1',
    'scripts/tests/test_accuracy_margin.py': 'KIND = "accuracy"',
    'evals/cases/rule.json': '{}',
    'evals/scenarios/first-run/scenario.json': '{}',
    'evals/runs/transcript.md': 'log',
    '.pytest_cache/CACHEDIR.TAG': 'cache',
    'scripts/__pycache__/margin.pyc': 'bytecode',
    'outputs/margin.json': 'a run result',
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
    fs.writeFileSync(path.join(src, rel), text);
  }

  const dest = path.join(root, 'dest/margin-doer');
  copySkill(src, dest);

  // What an agent needs to USE the skill ships...
  for (const rel of ['SKILL.md', 'references/schema.md', 'references/variations/default.md', 'scripts/margin.py', 'scripts/tests/test_accuracy_margin.py', 'evals/cases/rule.json']) {
    assert.ok(fs.existsSync(path.join(dest, rel)), `should ship: ${rel}`);
  }
  // ...the workshop's provenance and eval machinery does not.
  for (const rel of ['references/source-material', 'references/interview-notes.md', 'evals/scenarios', 'evals/runs', '.pytest_cache', 'scripts/__pycache__', 'outputs']) {
    assert.ok(!fs.existsSync(path.join(dest, rel)), `must NOT ship: ${rel}`);
  }
});

test('the publish CLI reads the use case from the first positional argument', () => {
  // Regression: `-1 + 1 === 0` once made the parser swallow argv[0], so
  // `npm run publish -- <use-case>` printed usage instead of running.
  const result = spawnSync('node', ['.framework/scripts/publish.mjs', 'no-such-use-case'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  assert.doesNotMatch(result.stdout + result.stderr, /^usage:/m);
});
