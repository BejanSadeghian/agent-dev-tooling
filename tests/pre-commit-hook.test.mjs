// End-to-end: copy the repo into a temp git repo and run hooks/pre-commit for real.
// These are the cases the hook exists to catch, so they are worth the cost of a copy.
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

function makeGitRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hook-'));
  fs.cpSync(REPO_ROOT, dir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`),
  });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.test'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'seed'], { cwd: dir });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const skillMd = (dir) => path.join(dir, '.claude/skills/hello-linter/SKILL.md');

test('the hook passes when nothing is staged', (t) => {
  const dir = makeGitRepo(t);
  const result = sh('hooks/pre-commit', dir);
  assert.equal(result.code, 0, result.out);
});

test('the hook passes for a skill edited and re-recorded together', (t) => {
  const dir = makeGitRepo(t);
  const file = path.join(dir, 'examples/skills/hello-linter/SKILL.md');
  fs.appendFileSync(file, '\n6. Delete this line when you copy it.\n');
  assert.equal(sh('node scripts/run-regression.mjs hello-linter', dir).code, 0);
  const staged = sh('git add -A && hooks/pre-commit', dir);
  assert.equal(staged.code, 0, staged.out);
});

test('the hook FAILS when a skill is edited without re-running its suite', (t) => {
  const dir = makeGitRepo(t);
  fs.appendFileSync(path.join(dir, 'examples/skills/hello-linter/SKILL.md'), '\n6. An unverified edit.\n');
  const result = sh('git add -A && hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /R5 stale: skill edited after its last regression run/);
});

test('the hook FAILS when the skill no longer matches the format spec', (t) => {
  const dir = makeGitRepo(t);
  const file = path.join(dir, 'examples/skills/hello-linter/SKILL.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Workflow', '## Steps'));
  sh('node scripts/run-regression.mjs hello-linter', dir);
  const result = sh('git add -A && hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /missing required heading "## Workflow"/);
});

test('the hook FAILS when a regression case goes red', (t) => {
  const dir = makeGitRepo(t);
  const file = path.join(dir, 'examples/skills/hello-linter/SKILL.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Copy this directory', 'Duplicate this folder'));
  sh('node scripts/run-regression.mjs hello-linter', dir);
  const result = sh('git add -A && hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /stays-minimal/);
});

test('the hook FAILS when the refreshed state file is left unstaged', (t) => {
  const dir = makeGitRepo(t);
  fs.appendFileSync(path.join(dir, 'examples/skills/hello-linter/SKILL.md'), '\n6. Another line.\n');
  sh('git add examples', dir);
  sh('node scripts/run-regression.mjs hello-linter', dir); // refreshes .skill-state, leaves it unstaged
  const result = sh('hooks/pre-commit', dir);
  assert.equal(result.code, 1);
  assert.match(result.out, /has unstaged changes/);
});

test('SKILL_GATE_FILES drives the gate the same way a staged list does', (t) => {
  const dir = makeGitRepo(t);
  fs.appendFileSync(path.join(dir, 'examples/skills/hello-linter/SKILL.md'), '\n6. Unverified.\n');
  const result = sh('hooks/pre-commit', dir, {
    SKILL_GATE_FILES: 'examples/skills/hello-linter/SKILL.md',
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /R5 stale/);
});

test('SKIP_SKILL_GATE=1 is an explicit, visible escape hatch', (t) => {
  const dir = makeGitRepo(t);
  fs.appendFileSync(path.join(dir, 'examples/skills/hello-linter/SKILL.md'), '\n6. Unverified.\n');
  const result = sh('git add -A && hooks/pre-commit', dir, { SKIP_SKILL_GATE: '1' });
  assert.equal(result.code, 0);
  assert.match(result.out, /skipped/);
});
