// The doer/interpreter pair is the framework's core idea: role detection,
// pairing, the schema contract, and the coverage each role owes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  artifactTarget,
  counterpartName,
  coverageGaps,
  pairFindings,
  roleOf,
  useCaseOf,
} from '../scripts/lib/roles.mjs';
import { validateSkill } from '../scripts/validate-skill.mjs';
import { loadCases, loadConfig } from '../scripts/lib/skills.mjs';
import { VALID_SCHEMA_MD, addSkill, doerSkillMd, interpreterSkillMd, makeRepo, messages } from './helpers.mjs';

const PY_TEST = (kind) => `KIND = "${kind}"\nCOVERS = ["sales-summary", "sales_summary.build"]\n`;

function makeDoerRepo(overrides = {}) {
  return makeRepo({
    name: 'sales-summary-doer',
    skillsRoot: 'skills',
    skillMd: doerSkillMd('sales-summary-doer'),
    schemaMd: VALID_SCHEMA_MD,
    scripts: { 'sales_summary.py': 'def build(rows):\n    return {"records": [], "deviations": []}\n' },
    ...overrides,
  });
}

test('roles are detected from the name suffix; tools are role-exempt', (t) => {
  const repo = makeDoerRepo();
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  assert.equal(roleOf(config, repo.skill), 'doer');
  assert.equal(roleOf(config, { name: 'sales-summary-interpreter', root: 'skills' }), 'interpreter');
  assert.equal(roleOf(config, { name: 'sales-summary', root: 'skills' }), null);
  assert.equal(roleOf(config, { name: 'dev-helper', root: '.github/skills' }), 'tool');
  assert.equal(useCaseOf(config, 'sales-summary-doer'), 'sales-summary');
  assert.equal(counterpartName(config, repo.skill), 'sales-summary-interpreter');
  assert.equal(artifactTarget(config, repo.skill), 'sales-summary');
});

test('a lone doer draws a pair warning; a complete pair draws none', (t) => {
  const repo = makeDoerRepo();
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const lone = pairFindings(config, [repo.skill]);
  assert.equal(lone.length, 1);
  assert.equal(lone[0].level, 'warn');
  assert.match(lone[0].message, /expected sales-summary-interpreter/);

  const other = addSkill(repo, { name: 'sales-summary-interpreter', skillMd: interpreterSkillMd('sales-summary-interpreter') });
  assert.deepEqual(pairFindings(config, [repo.skill, other]), []);
});

test('a product skill without a role suffix fails the format check', (t) => {
  const repo = makeRepo({ name: 'sales-summary', skillsRoot: 'skills' });
  t.after(repo.cleanup);
  assert.match(messages(validateSkill(loadConfig(repo.root), repo.skill)), /must be one half of a pair/);
});

test('a doer without references/schema.md fails the format check', (t) => {
  const repo = makeDoerRepo({ schemaMd: null });
  t.after(repo.cleanup);
  assert.match(messages(validateSkill(loadConfig(repo.root), repo.skill)), /doer has no references\/schema\.md/);
});

test('a doer schema that never mentions deviations fails the format check', (t) => {
  const repo = makeDoerRepo({ schemaMd: '# Schema\n\n{ "records": [] }\n' });
  t.after(repo.cleanup);
  assert.match(messages(validateSkill(loadConfig(repo.root), repo.skill)), /must define "deviations"/);
});

test('a doer with no scripts/ fails the format check', (t) => {
  const repo = makeDoerRepo({ scripts: {} });
  t.after(repo.cleanup);
  assert.match(messages(validateSkill(loadConfig(repo.root), repo.skill)), /doer has no scripts\//);
});

test('an interpreter must instruct the two-part output and name the schema', (t) => {
  const good = makeRepo({
    name: 'sales-summary-interpreter',
    skillsRoot: 'skills',
    skillMd: interpreterSkillMd('sales-summary-interpreter'),
  });
  t.after(good.cleanup);
  assert.deepEqual(validateSkill(loadConfig(good.root), good.skill).filter((f) => f.level !== 'warn'), []);

  const bad = makeRepo({
    name: 'sales-summary-interpreter',
    skillsRoot: 'skills',
    skillMd: interpreterSkillMd('sales-summary-interpreter').replace('## Interpretations', '## Opinions'),
  });
  t.after(bad.cleanup);
  assert.match(messages(validateSkill(loadConfig(bad.root), bad.skill)), /## Interpretations/);
});

test('a skill without references/variations fails the format check', (t) => {
  const repo = makeRepo({ variations: null });
  t.after(repo.cleanup);
  assert.match(messages(validateSkill(loadConfig(repo.root), repo.skill)), /missing references\/variations\//);
});

test('a doer owes all three kinds for its artifact and each module; tests close the gaps', (t) => {
  const repo = makeDoerRepo();
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const { cases } = loadCases(config, repo.skillDir);
  const gaps = coverageGaps(config, repo.skill, cases);
  // artifact + one module, three kinds each
  assert.equal(gaps.length, 6);
  assert.ok(gaps.every((g) => ['accuracy', 'edge', 'performance'].includes(g.kind)));
});

test('python test files declaring KIND and COVERS close doer gaps', (t) => {
  const repo = makeDoerRepo({
    pythonTests: {
      'test_accuracy_sales_summary.py': PY_TEST('accuracy'),
      'test_edge_sales_summary.py': PY_TEST('edge'),
      'test_performance_sales_summary.py': PY_TEST('performance'),
    },
  });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const { cases } = loadCases(config, repo.skillDir);
  assert.deepEqual(coverageGaps(config, repo.skill, cases), []);
});

test('interpreters and tools owe no three-kind coverage', (t) => {
  const repo = makeRepo({
    name: 'sales-summary-interpreter',
    skillsRoot: 'skills',
    skillMd: interpreterSkillMd('sales-summary-interpreter'),
  });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const { cases } = loadCases(config, repo.skillDir);
  assert.deepEqual(coverageGaps(config, repo.skill, cases), []);
});
