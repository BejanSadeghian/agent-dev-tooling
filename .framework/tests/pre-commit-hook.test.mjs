// End-to-end: copy the repo into a temp git repo and run .framework/hooks/pre-commit
// for real. These are the cases the hook exists to catch, so they are worth the copy.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REPO_ROOT } from '../scripts/lib/skills.mjs';

const sh = (cmd, cwd, env = {}) => {
  try {
    return {
      code: 0,
      out: execFileSync('bash', ['-c', cmd], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

const DEMO_MD = `---
name: hook-demo
description: >-
  A demo tool skill used by the hook tests, long enough to clear the minimum length rules.
  Use when a hook test needs a valid skill to edit.
---

# Hook demo

## When to use

Use when a hook test needs a valid skill.

## Workflow

1. Copy this directory somewhere and edit it.
`;

function makeGitRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hook-'));
  fs.cpSync(REPO_ROOT, dir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`),
  });

  // A synthetic skill this test owns, so scenarios never depend on the real dev skills.
  const skillDir = path.join(dir, '.github/skills/hook-demo');
  fs.mkdirSync(path.join(skillDir, 'evals/cases'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'references/variations'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), DEMO_MD);
  fs.writeFileSync(path.join(skillDir, 'references/variations/default.md'), '# Variation: default\n\nBaseline.\n');
  fs.writeFileSync(
    path.join(skillDir, 'evals/cases/stays-minimal.json'),
    JSON.stringify({ id: 'stays-minimal', description: 'keeps its copy line', type: 'contains', file: 'SKILL.md', patterns: ['Copy this directory'] }, null, 2) + '\n',
  );

  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  execFileSync('node', ['.framework/scripts/run-regression.mjs', 'hook-demo'], { cwd: dir });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'test');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, skillMd: path.join(skillDir, 'SKILL.md') };
}

test('the hook passes when nothing is staged', (t) => {
  const { dir } = makeGitRepo(t);
  const result = sh('.framework/hooks/pre-commit', dir);
  assert.equal(result.code, 0, result.out);
});

test('the hook passes for a skill edited and re-recorded together', (t) => {
  const { dir, skillMd } = makeGitRepo(t);
  fs.appendFileSync(skillMd, '\n2. A second step.\n');
  assert.equal(sh('node .framework/scripts/run-regression.mjs hook-demo', dir).code, 0);
  const staged = sh('git add -A && .framework/hooks/pre-commit', dir);
  assert.equal(staged.code, 0, staged.out);
});

test('the hook FAILS when a skill is edited without re-running its suite', (t) => {
  const { dir, skillMd } = makeGitRepo(t);
  fs.appendFileSync(skillMd, '\n2. An unverified edit.\n');
  const result = sh('git add .github/skills/hook-demo && .framework/hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /R5 stale: skill edited after its last regression run/);
});

test('the hook FAILS when the skill no longer matches the format spec', (t) => {
  const { dir, skillMd } = makeGitRepo(t);
  fs.writeFileSync(skillMd, fs.readFileSync(skillMd, 'utf8').replace('## Workflow', '## Steps'));
  sh('node .framework/scripts/run-regression.mjs hook-demo', dir);
  const result = sh('git add .github/skills/hook-demo .framework/state && .framework/hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /missing required heading "## Workflow"/);
});

test('the hook FAILS when a regression case goes red', (t) => {
  const { dir, skillMd } = makeGitRepo(t);
  fs.writeFileSync(skillMd, fs.readFileSync(skillMd, 'utf8').replace('Copy this directory', 'Duplicate this folder'));
  sh('node .framework/scripts/run-regression.mjs hook-demo', dir);
  const result = sh('git add .github/skills/hook-demo .framework/state && .framework/hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /stays-minimal/);
});

test('the hook FAILS when the refreshed state file is left unstaged', (t) => {
  const { dir, skillMd } = makeGitRepo(t);
  fs.appendFileSync(skillMd, '\n2. Another line.\n');
  sh('git add .github/skills/hook-demo', dir);
  sh('node .framework/scripts/run-regression.mjs hook-demo', dir); // refreshes .framework/state, leaves it unstaged
  const result = sh('.framework/hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /has unstaged changes/);
});

test('SKILL_GATE_FILES drives the gate the same way a staged list does', (t) => {
  const { dir, skillMd } = makeGitRepo(t);
  fs.appendFileSync(skillMd, '\n2. Unverified.\n');
  const result = sh('.framework/hooks/pre-commit', dir, {
    SKILL_GATE_FILES: '.github/skills/hook-demo/SKILL.md',
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /R5 stale/);
});

test('SKIP_SKILL_GATE=1 is an explicit, visible escape hatch', (t) => {
  const { dir, skillMd } = makeGitRepo(t);
  fs.appendFileSync(skillMd, '\n2. Unverified.\n');
  const result = sh('git add -A && .framework/hooks/pre-commit', dir, { SKIP_SKILL_GATE: '1' });
  assert.equal(result.code, 0);
  assert.match(result.out, /skipped/);
});
