// The Python harness has its own tests, written in Python. This runs them as part
// of `npm test`, so a change to the harness cannot land untested from either side.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { REPO_ROOT } from '../scripts/lib/skills.mjs';
import { hasPython } from '../scripts/lib/python.mjs';

test('the Python test harness passes its own tests', { skip: !hasPython() && 'python3 not installed' }, () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', '.framework/harness/tests', '-t', '.framework/harness/tests'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: path.join(REPO_ROOT, '.framework/harness'), PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /OK/);
});
