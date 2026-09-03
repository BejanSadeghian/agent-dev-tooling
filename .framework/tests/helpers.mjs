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

/** A minimal doer SKILL.md for role-rule tests (name must be <use-case>-doer). */
export const doerSkillMd = (name) => `---
name: ${name}
description: >-
  A demo doer used by the tooling tests, long enough to clear the minimum description length.
  Use when a test needs a doer that satisfies the format spec.
---

# ${name}

## When to use

Use when a test needs a valid doer.

## Workflow

1. Run the deterministic code in scripts/.
`;

/** A minimal interpreter SKILL.md satisfying the two-part output rules. */
export const interpreterSkillMd = (name) => `---
name: ${name}
description: >-
  A demo interpreter used by the tooling tests, long enough to clear the minimum length.
  Use when a test needs an interpreter that satisfies the format spec.
---

# ${name}

## When to use

Use when a test needs a valid interpreter.

## Workflow

1. Read the doer's artifact per its references/schema.md, including deviations.
2. Produce the two-part output:

\`\`\`markdown
## Facts

- what the artifact shows

## Interpretations

- what it means
\`\`\`
`;

export const VALID_SCHEMA_MD = `# Artifact schema

\`\`\`json
{ "records": [ { } ], "deviations": [] }
\`\`\`

The deviations field is always present, possibly empty.
`;

/**
 * Create a temp repo containing .framework/framework.json and one skill.
 * The default skill lives under .github/skills (role-exempt "tool"), fully
 * conformant: SKILL.md, references/variations/, evals/cases/.
 * @returns {{root: string, skillDir: string, skill: object, cleanup: () => void}}
 */
export function makeRepo({
  name = 'demo-skill',
  skillsRoot = '.github/skills',
  skillMd = VALID_SKILL_MD,
  cases = [VALID_CASE],
  variations = { 'default.md': '# Variation: default\n\nBaseline behaviour.\n' },
  schemaMd = null,
  scripts = {},
  config = {},
  pythonTests = {},
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-tooling-'));
  const base = JSON.parse(fs.readFileSync(new URL('../framework.json', import.meta.url), 'utf8'));
  const merged = { ...base, ...config, skillsDirs: config.skillsDirs ?? [...new Set([skillsRoot, 'skills'])] };
  fs.mkdirSync(path.join(root, '.framework'), { recursive: true });
  fs.writeFileSync(path.join(root, '.framework/framework.json'), JSON.stringify(merged, null, 2));

  const skillDir = path.join(root, skillsRoot, name);
  fs.mkdirSync(path.join(skillDir, 'evals/cases'), { recursive: true });
  if (skillMd !== null) fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  cases.forEach((c, i) =>
    fs.writeFileSync(path.join(skillDir, 'evals/cases', `case-${i}.json`), JSON.stringify(c, null, 2)),
  );
  if (variations) {
    fs.mkdirSync(path.join(skillDir, 'references/variations'), { recursive: true });
    for (const [file, contents] of Object.entries(variations)) {
      fs.writeFileSync(path.join(skillDir, 'references/variations', file), contents);
    }
  }
  if (schemaMd) {
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'references/schema.md'), schemaMd);
  }
  for (const [file, contents] of Object.entries(scripts)) {
    const target = path.join(skillDir, 'scripts', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  for (const [file, contents] of Object.entries(pythonTests)) {
    const target = path.join(skillDir, 'scripts/tests', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }

  return {
    root,
    skillDir,
    skill: { name, dir: skillDir, root: skillsRoot },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** Add a second skill to an existing makeRepo() repo, same conformance defaults. */
export function addSkill(repo, {
  name,
  skillsRoot = 'skills',
  skillMd,
  cases = [VALID_CASE],
  variations = { 'default.md': '# Variation: default\n\nBaseline behaviour.\n' },
  schemaMd = null,
  scripts = {},
} = {}) {
  const skillDir = path.join(repo.root, skillsRoot, name);
  fs.mkdirSync(path.join(skillDir, 'evals/cases'), { recursive: true });
  if (skillMd) fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  cases.forEach((c, i) =>
    fs.writeFileSync(path.join(skillDir, 'evals/cases', `case-${i}.json`), JSON.stringify(c, null, 2)),
  );
  if (variations) {
    fs.mkdirSync(path.join(skillDir, 'references/variations'), { recursive: true });
    for (const [file, contents] of Object.entries(variations)) {
      fs.writeFileSync(path.join(skillDir, 'references/variations', file), contents);
    }
  }
  if (schemaMd) {
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'references/schema.md'), schemaMd);
  }
  for (const [file, contents] of Object.entries(scripts)) {
    const target = path.join(skillDir, 'scripts', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return { name, dir: skillDir, root: skillsRoot };
}

export const messages = (findings) => findings.map((f) => f.message).join('\n');
