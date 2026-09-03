import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverSkills, loadConfig, skillForPath } from '../scripts/lib/skills.mjs';

const config = loadConfig();

test('maps a file inside a skill back to the skill', () => {
  assert.equal(skillForPath(config, '.github/skills/skill-builder/references/interview.md'), 'skill-builder');
  assert.equal(skillForPath(config, 'skills/demo-doer/SKILL.md'), 'demo-doer');
});

test('returns null for files outside any skills root', () => {
  assert.equal(skillForPath(config, '.framework/scripts/validate-skill.mjs'), null);
  assert.equal(skillForPath(config, 'README.md'), null);
  assert.equal(skillForPath(config, '.github/skills/.hidden/SKILL.md'), null);
});

test('a loose file directly in a skills root is not a skill', () => {
  assert.equal(skillForPath(config, 'skills/README.md'), null);
  assert.equal(skillForPath(config, 'skills/Not_A_Skill/SKILL.md'), null);
});

test('every configured skills root is discovered', () => {
  const names = discoverSkills(config).map((s) => s.name);
  assert.ok(names.includes('skill-builder'));
  assert.ok(names.includes('test-generator'));
  assert.ok(names.includes('dev-helper'));
});

test('this repo ships only skills that satisfy their own rubric', async () => {
  // Guards the tooling against drifting away from the skills it ships.
  const { checkRubric } = await import('../scripts/check-rubric.mjs');
  for (const skill of discoverSkills(config)) {
    const errors = checkRubric(config, skill).filter((f) => f.level !== 'warn');
    assert.deepEqual(errors, [], `${skill.name}: ${errors.map((e) => e.message).join('; ')}`);
  }
});
