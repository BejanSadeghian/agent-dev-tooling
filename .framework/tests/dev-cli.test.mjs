// The friendly commands are what a non-technical author actually uses. These run
// them for real in a throwaway git repo: what they refuse matters more than what
// they do.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REPO_ROOT } from '../scripts/lib/skills.mjs';
import { installHint } from '../scripts/dev.mjs';

const dev = (dir, args, env = {}) =>
  spawnSync('node', ['.framework/scripts/dev.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });

function makeRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-dev-'));
  fs.cpSync(REPO_ROOT, dir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`),
  });
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'test');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, git };
}

test('status explains where you are and what to do next', (t) => {
  const { dir } = makeRepo(t);
  const result = dev(dir, ['status']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Branch:\s+main/);
  assert.match(result.stdout, /What to do next/);
  assert.match(result.stdout, /npm run start/);
});

test('status warns that main is the shared branch when there are changes', (t) => {
  const { dir } = makeRepo(t);
  fs.appendFileSync(path.join(dir, 'README.md'), '\nchanged\n');
  const result = dev(dir, ['status']);
  assert.match(result.stdout, /this is the shared one/);
  assert.match(result.stdout, /npm run start/);
});

test('start creates a skill/ branch named after the work', (t) => {
  const { dir, git } = makeRepo(t);
  const result = dev(dir, ['start', 'Margin Check v2']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD').trim(), 'skill/margin-check-v2');
  assert.match(result.stdout, /separate from main until it is reviewed/);
});

test('doctor reports the setup and switches the safety checks back on', (t) => {
  const { dir, git } = makeRepo(t);
  spawnSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: dir });
  const result = dev(dir, ['doctor']);
  assert.match(result.stdout, /git is installed/);
  assert.match(result.stdout, /safety checks run before anything is saved/);
  assert.equal(git('config', 'core.hooksPath').trim(), '.framework/hooks');
});

test('an unknown command prints the list of commands', (t) => {
  const { dir } = makeRepo(t);
  const result = dev(dir, ['frobnicate']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /npm run publish/);
});

test('installHint names the one command for whatever package manager exists', () => {
  const only = (bin) => (cmd) => cmd === bin;
  assert.equal(installHint(['git', 'python'], only('brew')), 'brew install git python');
  assert.equal(installHint(['node'], only('apt-get')), 'sudo apt-get update && sudo apt-get install -y nodejs npm');
  assert.match(installHint(['git', 'gh'], only('winget')), /winget install --id Git\.Git && winget install --id GitHub\.cli/);
  assert.equal(installHint(['git'], () => false), null);
  assert.equal(installHint([], only('brew')), null);
});
