import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkRubric } from '../scripts/check-rubric.mjs';
import { validateSkill } from '../scripts/validate-skill.mjs';
import { activeArtifacts, collectCoverage, coverageGaps, readManifest, validateManifest } from '../scripts/lib/manifest.mjs';
import { loadCases, loadConfig } from '../scripts/lib/skills.mjs';
import { makeRepo, messages } from './helpers.mjs';

const ARTIFACT = {
  id: 'summary-table',
  path: 'outputs/summary.csv',
  kind: 'data',
  description: 'the summary',
};

const withArtifact = (extra = {}) => ({
  name: 'demo-skill',
  kind: 'analysis',
  summary: 'produces a summary table',
  artifacts: [{ ...ARTIFACT, ...extra }],
});

const validate = (repo, manifest) => validateManifest(loadConfig(repo.root), repo.skill, manifest);

test('a manifest missing required fields is reported', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const problems = validate(repo, { name: 'demo-skill' });
  assert.match(messages(problems), /missing "kind"/);
  assert.match(messages(problems), /missing "artifacts"/);
});

test('the manifest name must match the directory', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.match(messages(validate(repo, { name: 'other', kind: 'utility', artifacts: [] })), /does not match directory/);
});

test('artifact ids must be kebab-case and unique', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const bad = validate(repo, { name: 'demo-skill', kind: 'analysis', artifacts: [{ ...ARTIFACT, id: 'Summary Table' }] });
  assert.match(messages(bad), /must match \^\[a-z0-9\]/);
  const dupes = validate(repo, { name: 'demo-skill', kind: 'analysis', artifacts: [ARTIFACT, ARTIFACT] });
  assert.match(messages(dupes), /duplicate artifact id/);
});

test('an unknown artifact kind is rejected', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.match(messages(validate(repo, withArtifact({ kind: 'vibes' }))), /unknown kind "vibes"/);
});

test('switching an artifact off requires a reason', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.match(messages(validate(repo, withArtifact({ generate: false }))), /gives no "skipReason"/);
  assert.deepEqual(validate(repo, withArtifact({ generate: false, skipReason: 'the team reads the CSV' })), []);
});

test('a python entrypoint without a module is reported', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const problems = validate(repo, { name: 'demo-skill', kind: 'analysis', artifacts: [], python: { entrypoints: ['missing.thing'] } });
  assert.match(messages(problems), /has no module at python\/missing\.py/);
});

test('coverage is collected from JSON cases and Python test markers', (t) => {
  const repo = makeRepo({
    manifest: withArtifact(),
    cases: [{ id: 'a', description: 'x', type: 'contains', file: 'SKILL.md', patterns: ['Workflow'], kind: 'accuracy', covers: ['summary-table'] }],
    pythonTests: {
      'test_edge_demo.py': 'KIND = "edge"\nCOVERS = ["summary-table", "demo.build"]\n',
    },
  });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const { cases } = loadCases(config, repo.skillDir);
  const coverage = collectCoverage(config, repo.skillDir, cases);
  assert.deepEqual([...coverage.get('summary-table')].sort(), ['accuracy', 'edge']);
  assert.deepEqual([...coverage.get('demo.build')], ['edge']);
});

test('an artifact missing a kind of test is a gap', (t) => {
  const repo = makeRepo({
    manifest: withArtifact(),
    cases: [{ id: 'a', description: 'x', type: 'contains', file: 'SKILL.md', patterns: ['Workflow'], kind: 'accuracy', covers: ['summary-table'] }],
  });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const { cases } = loadCases(config, repo.skillDir);
  const gaps = coverageGaps(config, repo.skillDir, readManifest(config, repo.skillDir).manifest, cases);
  assert.deepEqual(gaps.map((g) => g.kind).sort(), ['edge', 'performance']);
});

test('a switched-off artifact is exempt from coverage', (t) => {
  const repo = makeRepo({ manifest: withArtifact({ generate: false, skipReason: 'not wanted' }) });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  assert.deepEqual(activeArtifacts(readManifest(config, repo.skillDir).manifest), []);
  assert.deepEqual(coverageGaps(config, repo.skillDir, readManifest(config, repo.skillDir).manifest, []), []);
});

test('R8: the rubric fails a skill whose artifact has no tests', (t) => {
  const repo = makeRepo({ manifest: withArtifact() });
  t.after(repo.cleanup);
  const findings = messages(checkRubric(loadConfig(repo.root), repo.skill, repo.root));
  assert.match(findings, /R8 artifact "summary-table" has no accuracy test/);
  assert.match(findings, /npm run test:new/);
});

test('a case covering an artifact that is not declared is a format error', (t) => {
  const repo = makeRepo({
    cases: [{ id: 'a', description: 'x', type: 'contains', file: 'SKILL.md', patterns: ['Workflow'], kind: 'accuracy', covers: ['ghost-artifact'] }],
  });
  t.after(repo.cleanup);
  const findings = messages(validateSkill(loadConfig(repo.root), repo.skill));
  assert.match(findings, /covers "ghost-artifact", which is not an artifact/);
});

test('an unknown test kind is a format error', (t) => {
  const repo = makeRepo({
    cases: [{ id: 'a', description: 'x', type: 'contains', file: 'SKILL.md', patterns: ['Workflow'], kind: 'vibes' }],
  });
  t.after(repo.cleanup);
  assert.match(messages(validateSkill(loadConfig(repo.root), repo.skill)), /unknown kind "vibes"/);
});
