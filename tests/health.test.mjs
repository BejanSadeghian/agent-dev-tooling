// The health report is the anti-degradation guard: these are the specific ways a
// growing library rots, and the report must name each one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspect, jaccard } from '../scripts/health.mjs';
import { checkSequences, duplicateArtifactIds, loadSequences } from '../scripts/lib/sequences.mjs';
import { hashSkill, loadConfig, writeState } from '../scripts/lib/skills.mjs';
import { makeRepo, VALID_SKILL_MD } from './helpers.mjs';

const messages = (issues) => issues.map((i) => `${i.level}: ${i.skill}: ${i.message}`).join('\n');

function addSkill(repo, name, { description, manifest, cases = [] } = {}) {
  const dir = path.join(repo.root, '.claude/skills', name);
  fs.mkdirSync(path.join(dir, 'evals/cases'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    VALID_SKILL_MD.replace('name: demo-skill', `name: ${name}`).replace(
      /description: >-\n(.*\n)+?---/,
      `description: >-\n  ${description}\n---`,
    ),
  );
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ name, kind: 'utility', artifacts: [], ...manifest }, null, 2));
  cases.forEach((c, i) => fs.writeFileSync(path.join(dir, 'evals/cases', `c${i}.json`), JSON.stringify(c)));
  return dir;
}

test('jaccard scores overlapping descriptions high and unrelated ones low', () => {
  const a = 'Summarises transaction rows by category and writes a brief. Use when someone wants sales summarised.';
  const b = 'Summarises transaction rows by category and writes a report. Use when someone wants sales summarised.';
  const c = 'Renames image files based on their capture date. Use when photos need tidying.';
  assert.ok(jaccard(a, b) > 0.7, `expected high overlap, got ${jaccard(a, b)}`);
  assert.ok(jaccard(a, c) < 0.2, `expected low overlap, got ${jaccard(a, c)}`);
  assert.equal(jaccard('', 'anything'), 0);
});

test('a skill whose tests never ran is reported with the command that fixes it', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const { issues } = inspect(loadConfig(repo.root), repo.root);
  const text = messages(issues);
  assert.match(text, /its tests have never been run/);
  assert.match(text, /error/);
});

test('two skills with near-identical descriptions are flagged as a collision risk', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const shared = 'Summarises transaction rows by product category and writes a short brief. Use when someone wants sales summarised by category.';
  addSkill(repo, 'sales-one', { description: shared });
  addSkill(repo, 'sales-two', { description: shared.replace('brief', 'report') });
  const { issues } = inspect(loadConfig(repo.root), repo.root);
  assert.match(messages(issues), /alike — the agent may fire the wrong one/);
});

test('two skills claiming the same artifact id is an error', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const artifact = { id: 'summary-table', path: 'outputs/s.csv', kind: 'data' };
  addSkill(repo, 'first', { description: 'Produces the summary table for finance. Use when finance needs it.', manifest: { artifacts: [artifact] } });
  addSkill(repo, 'second', { description: 'Builds a completely unrelated inventory count. Use when stock is counted.', manifest: { artifacts: [artifact] } });
  const config = loadConfig(repo.root);
  assert.deepEqual(duplicateArtifactIds(config, repo.root), [{ id: 'summary-table', skills: ['first', 'second'] }]);
  assert.match(messages(inspect(config, repo.root).issues), /both claim to produce the artifact "summary-table"/);
});

test('a skill not exercised for a long time is flagged as stale', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  writeState(
    config,
    'demo-skill',
    { skill: 'demo-skill', contentHash: hashSkill(repo.skillDir), passed: true, total: 1, failed: 0, ranAt: '2026-01-01T00:00:00.000Z', cases: [] },
    repo.root,
  );
  const now = Date.parse('2026-08-24T00:00:00.000Z');
  const { issues } = inspect(config, repo.root, now);
  assert.match(messages(issues), /not exercised in \d+ days/);
});

test('a sequence naming a skill that does not exist is an error', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  fs.mkdirSync(path.join(repo.root, 'sequences'), { recursive: true });
  fs.writeFileSync(
    path.join(repo.root, 'sequences/chain.json'),
    JSON.stringify({ id: 'chain', steps: [{ skill: 'ghost-skill', consumes: [], produces: [] }] }),
  );
  const findings = checkSequences(loadConfig(repo.root), repo.root);
  assert.match(findings.map((f) => f.message).join('\n'), /names "ghost-skill", which is not a skill/);
});

test('a step consuming something no earlier step produces is an error', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  addSkill(repo, 'step-two', {
    description: 'Consumes the cleaned rows and writes the summary. Use when the cleaned rows exist.',
    manifest: { artifacts: [{ id: 'summary', path: 'outputs/s.csv', kind: 'data' }] },
  });
  fs.mkdirSync(path.join(repo.root, 'sequences'), { recursive: true });
  fs.writeFileSync(
    path.join(repo.root, 'sequences/chain.json'),
    JSON.stringify({ id: 'chain', steps: [{ skill: 'step-two', consumes: ['clean-rows'], produces: ['summary'] }] }),
  );
  const findings = checkSequences(loadConfig(repo.root), repo.root);
  assert.match(findings.map((f) => f.message).join('\n'), /consumes "clean-rows", which no earlier step produces/);
});

test('a wired sequence passes', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  addSkill(repo, 'step-one', {
    description: 'Cleans the raw rows so later steps can rely on them. Use when raw rows arrive.',
    manifest: { artifacts: [{ id: 'clean-rows', path: 'outputs/clean.csv', kind: 'data' }] },
  });
  addSkill(repo, 'step-two', {
    description: 'Summarises the cleaned rows into one row per category. Use when cleaned rows exist.',
    manifest: { artifacts: [{ id: 'summary', path: 'outputs/s.csv', kind: 'data' }] },
  });
  fs.mkdirSync(path.join(repo.root, 'sequences'), { recursive: true });
  fs.writeFileSync(
    path.join(repo.root, 'sequences/chain.json'),
    JSON.stringify({
      id: 'chain',
      inputs: ['raw-rows'],
      steps: [
        { skill: 'step-one', consumes: ['raw-rows'], produces: ['clean-rows'] },
        { skill: 'step-two', consumes: ['clean-rows'], produces: ['summary'] },
      ],
    }),
  );
  const config = loadConfig(repo.root);
  assert.deepEqual(checkSequences(config, repo.root), []);
  assert.equal(loadSequences(config, repo.root).length, 1);
});

test("this repo's own sequences are wired correctly", () => {
  assert.deepEqual(checkSequences(loadConfig()).filter((f) => f.level === 'error'), []);
});
