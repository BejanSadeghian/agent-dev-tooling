import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateSkill } from '../scripts/validate-skill.mjs';
import { loadConfig } from '../scripts/lib/skills.mjs';
import { VALID_SKILL_MD, makeRepo, messages } from './helpers.mjs';

const validate = (repo) => validateSkill(loadConfig(repo.root), repo.skill);

test('a well-formed skill produces no errors', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  assert.deepEqual(validate(repo).filter((f) => f.level !== 'warn'), []);
});

test('missing SKILL.md is an error', (t) => {
  const repo = makeRepo({ skillMd: null });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /missing required file SKILL\.md/);
});

test('missing frontmatter is an error', (t) => {
  const repo = makeRepo({ skillMd: '# No frontmatter\n\n## When to use\n\n## Workflow\n' });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /no YAML frontmatter/);
});

test('name must match the directory name', (t) => {
  const repo = makeRepo({ skillMd: VALID_SKILL_MD.replace('name: demo-skill', 'name: other-name') });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /does not match directory/);
});

test('name must be kebab-case', (t) => {
  const repo = makeRepo({ name: 'Demo_Skill', skillMd: VALID_SKILL_MD.replace('name: demo-skill', 'name: Demo_Skill') });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /must match \^\[a-z0-9\]/);
});

test('a description without a trigger clause is an error', (t) => {
  const repo = makeRepo({
    skillMd: VALID_SKILL_MD.replace('Use when a test needs a skill that satisfies the format spec.', 'It exists for tests and does a variety of unspecified things.'),
  });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /needs a trigger clause/);
});

test('a too-short description is an error', (t) => {
  const repo = makeRepo({ skillMd: '---\nname: demo-skill\ndescription: too short\n---\n\n## When to use\n\n## Workflow\n' });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /description is \d+ chars, min/);
});

test('unknown frontmatter keys are rejected', (t) => {
  const repo = makeRepo({ skillMd: VALID_SKILL_MD.replace('---\n\n# Demo skill', 'colour: blue\n---\n\n# Demo skill') });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /unknown frontmatter key "colour"/);
});

test('missing required headings are reported', (t) => {
  const repo = makeRepo({ skillMd: VALID_SKILL_MD.replace('## Workflow', '## Steps') });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /missing required heading "## Workflow"/);
});

test('forbidden placeholder text is rejected', (t) => {
  const repo = makeRepo({ skillMd: VALID_SKILL_MD + '\n2. TODO finish this.\n' });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /forbidden pattern/);
});

test('unexpected directories inside a skill are rejected', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  fs.mkdirSync(path.join(repo.skillDir, 'src'));
  assert.match(messages(validate(repo)), /unexpected directory "src\/"/);
});

test('a skill with no regression cases is invalid', (t) => {
  const repo = makeRepo({ cases: [] });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /0 regression case\(s\), min 1/);
});

test('a case missing required fields is reported', (t) => {
  const repo = makeRepo({ cases: [{ type: 'contains', file: 'SKILL.md', patterns: ['x'] }] });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /case missing field "id"/);
});

test('duplicate case ids are reported', (t) => {
  const repo = makeRepo({
    cases: [
      { id: 'dup', description: 'a', type: 'contains', file: 'SKILL.md', patterns: ['## Workflow'] },
      { id: 'dup', description: 'b', type: 'contains', file: 'SKILL.md', patterns: ['## Workflow'] },
    ],
  });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /duplicate case id "dup"/);
});

test('an unknown case type is reported', (t) => {
  const repo = makeRepo({ cases: [{ id: 'x', description: 'y', type: 'vibes' }] });
  t.after(repo.cleanup);
  assert.match(messages(validate(repo)), /unknown case type "vibes"/);
});

test('invalid JSON in a case file is reported, not thrown', (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  fs.writeFileSync(path.join(repo.skillDir, 'evals/cases/broken.json'), '{ not json');
  assert.match(messages(validate(repo)), /invalid JSON/);
});
