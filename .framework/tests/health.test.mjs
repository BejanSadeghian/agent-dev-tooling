// The health report is the anti-degradation guard: these are the specific ways a
// growing library rots, and the report must name each one.
import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect, jaccard } from '../scripts/health.mjs';
import { hashSkill, loadConfig, writeState } from '../scripts/lib/skills.mjs';
import { VALID_SCHEMA_MD, VALID_SKILL_MD, addSkill, doerSkillMd, interpreterSkillMd, makeRepo } from './helpers.mjs';

const messages = (issues) => issues.map((i) => `${i.level}: ${i.skill}: ${i.message}`).join('\n');

const named = (name, description) =>
  VALID_SKILL_MD.replace('name: demo-skill', `name: ${name}`).replace(
    /description: >-\n(.*\n)+?---/,
    `description: >-\n  ${description}\n---`,
  );

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
  addSkill(repo, { name: 'sales-one-doer', skillMd: named('sales-one-doer', shared), schemaMd: VALID_SCHEMA_MD, scripts: { 'a.py': 'x = 1\n' } });
  addSkill(repo, { name: 'sales-two-doer', skillMd: named('sales-two-doer', shared.replace('brief', 'report')), schemaMd: VALID_SCHEMA_MD, scripts: { 'a.py': 'x = 1\n' } });
  const config = loadConfig(repo.root);
  assert.match(messages(inspect(config, repo.root).issues), /alike — the agent may fire the wrong one/);
});

test('a lone doer is warned about as an incomplete pair, and completing it clears the warning', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  addSkill(repo, { name: 'margin-doer', skillMd: doerSkillMd('margin-doer'), schemaMd: VALID_SCHEMA_MD, scripts: { 'a.py': 'x = 1\n' } });
  const config = loadConfig(repo.root);
  assert.match(messages(inspect(config, repo.root).issues), /warn: margin-doer: has no interpreter.*expected margin-interpreter/);

  addSkill(repo, { name: 'margin-interpreter', skillMd: interpreterSkillMd('margin-interpreter') });
  assert.doesNotMatch(messages(inspect(config, repo.root).issues), /has no interpreter/);
});

test('the pair warning never escalates to an error', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  addSkill(repo, { name: 'margin-interpreter', skillMd: interpreterSkillMd('margin-interpreter') });
  const config = loadConfig(repo.root);
  const pairIssues = inspect(config, repo.root).issues.filter((i) => /has no doer/.test(i.message));
  assert.equal(pairIssues.length, 1);
  assert.equal(pairIssues[0].level, 'warn');
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
