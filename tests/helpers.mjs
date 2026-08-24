// Builds throwaway repos on disk so the tooling can be tested the way it actually runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VALID_SKILL_MD = `---
name: demo-skill
description: >-
  A demo skill used by the tooling tests, long enough to clear the minimum description length.
  Use when a test needs a skill that satisfies the format spec.
---

# Demo skill

## When to use

Use when a test needs a valid skill.

## Workflow

1. Do the thing.
`;

export const VALID_CASE = {
  id: 'has-workflow',
  description: 'The skill still documents a workflow.',
  type: 'contains',
  file: 'SKILL.md',
  patterns: ['## Workflow'],
};

/**
 * Create a temp repo containing skill.config.json and one skill.
 * @returns {{root: string, skillDir: string, cleanup: () => void}}
 */
export const VALID_MANIFEST = {
  name: 'demo-skill',
  kind: 'utility',
  summary: 'A demo skill used by the tooling tests.',
  artifacts: [],
};

export function makeRepo({
  name = 'demo-skill',
  skillMd = VALID_SKILL_MD,
  cases = [VALID_CASE],
  manifest = VALID_MANIFEST,
  config = {},
  pythonTests = {},
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-tooling-'));
  const base = JSON.parse(
    fs.readFileSync(new URL('../skill.config.json', import.meta.url), 'utf8'),
  );
  const merged = { ...base, ...config, skillsDirs: config.skillsDirs ?? ['.claude/skills'] };
  fs.writeFileSync(path.join(root, 'skill.config.json'), JSON.stringify(merged, null, 2));

  const skillDir = path.join(root, '.claude/skills', name);
  fs.mkdirSync(path.join(skillDir, 'evals/cases'), { recursive: true });
  if (skillMd !== null) fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  cases.forEach((c, i) =>
    fs.writeFileSync(path.join(skillDir, 'evals/cases', `case-${i}.json`), JSON.stringify(c, null, 2)),
  );
  if (manifest) {
    fs.writeFileSync(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({ ...manifest, name }, null, 2) + '\n',
    );
  }
  for (const [file, contents] of Object.entries(pythonTests)) {
    const target = path.join(skillDir, 'python/tests', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }

  return {
    root,
    skillDir,
    skill: { name, dir: skillDir, root: '.claude/skills' },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export const messages = (findings) => findings.map((f) => f.message).join('\n');
