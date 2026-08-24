import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkRubric } from '../scripts/check-rubric.mjs';
import { runSkillSuite } from '../scripts/run-regression.mjs';
import { hashSkill, loadConfig, writeState } from '../scripts/lib/skills.mjs';
import { makeRepo, messages } from './helpers.mjs';

const record = (repo, overrides = {}) => {
  const config = loadConfig(repo.root);
  const run = runSkillSuite(config, repo.skill);
  writeState(
    config,
    repo.skill.name,
    {
      skill: run.skill,
      contentHash: run.contentHash,
      passed: run.passed,
      total: run.total,
      failed: run.failed,
      ranAt: '2026-08-24T00:00:00.000Z',
      cases: run.results.map(({ id, passed }) => ({ id, passed })),
      ...overrides,
    },
    repo.root,
  );
  return run;
};

const check = (repo) => checkRubric(loadConfig(repo.root), repo.skill, repo.root);

test('R3: a skill whose suite was never run fails the rubric', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.match(messages(check(repo)), /R3 regression suite never run/);
});

test('a recorded green run on unchanged content passes the rubric', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  record(repo);
  assert.deepEqual(check(repo).filter((f) => f.level !== 'warn'), []);
});

test('R5: editing the skill after the recorded run makes it stale', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  record(repo);
  fs.appendFileSync(path.join(repo.skillDir, 'SKILL.md'), '\n2. Another step.\n');
  assert.match(messages(check(repo)), /R5 stale: skill edited after its last regression run/);
});

test('R5: adding or editing a case also makes the suite stale', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  record(repo);
  fs.writeFileSync(
    path.join(repo.skillDir, 'evals/cases/extra.json'),
    JSON.stringify({ id: 'extra', description: 'another rule', type: 'contains', file: 'SKILL.md', patterns: ['Workflow'] }),
  );
  assert.match(messages(check(repo)), /R5 stale/);
});

test('R4: a recorded failing run fails the rubric', (t) => {
  const repo = makeRepo({
    cases: [{ id: 'nope', description: 'asserts something untrue', type: 'contains', file: 'SKILL.md', patterns: ['NOT PRESENT'] }],
  });
  t.after(repo.cleanup);
  const run = record(repo);
  assert.equal(run.passed, false);
  assert.match(messages(check(repo)), /R4 last regression run failed/);
});

test('R2: no cases fails before freshness is even considered', (t) => {
  const repo = makeRepo({ cases: [] });
  t.after(repo.cleanup);
  const findings = messages(check(repo));
  assert.match(findings, /R2 no regression cases/);
  assert.doesNotMatch(findings, /R3|R5/);
});

test('a corrupt state file fails the rubric instead of throwing', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  record(repo);
  fs.writeFileSync(path.join(repo.root, '.skill-state', 'demo-skill.json'), 'not json');
  assert.match(messages(check(repo)), /is not valid JSON/);
});

test('format failures surface through the rubric gate as well', (t) => {
  const repo = makeRepo({ skillMd: '---\nname: demo-skill\ndescription: short\n---\n\n## When to use\n\n## Workflow\n' });
  t.after(repo.cleanup);
  record(repo);
  assert.match(messages(check(repo)), /format: description is/);
});

test('the content hash covers every file in the skill directory', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const before = hashSkill(repo.skillDir);
  fs.mkdirSync(path.join(repo.skillDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(repo.skillDir, 'references/notes.md'), 'new depth');
  assert.notEqual(hashSkill(repo.skillDir), before);
});
