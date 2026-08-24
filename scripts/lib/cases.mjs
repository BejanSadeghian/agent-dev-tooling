// Regression-case executors. Every case type is deterministic and offline:
// a case that can flake is not a regression test.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const readInSkill = (skillDir, rel) => {
  const abs = path.resolve(skillDir, rel);
  if (!abs.startsWith(path.resolve(skillDir))) throw new Error(`path escapes skill dir: ${rel}`);
  if (!fs.existsSync(abs)) throw new Error(`no such file: ${rel}`);
  return fs.readFileSync(abs, 'utf8');
};

// Dotted key lookup. A list is traversed through its first element, so
// "artifacts.id" means "every artifact declares an id" without index noise.
const getPath = (obj, dotted) =>
  dotted.split('.').reduce((acc, key) => {
    const cursor = Array.isArray(acc) ? acc[0] : acc;
    return cursor === undefined || cursor === null ? undefined : cursor[key];
  }, obj);

export const CASE_TYPES = {
  files_exist: {
    required: ['paths'],
    run(c, skillDir) {
      const missing = (c.paths ?? []).filter((p) => !fs.existsSync(path.resolve(skillDir, p)));
      return missing.length
        ? { passed: false, message: `missing: ${missing.join(', ')}` }
        : { passed: true };
    },
  },

  contains: {
    required: ['file', 'patterns'],
    run(c, skillDir) {
      const text = readInSkill(skillDir, c.file);
      const flags = c.ignoreCase ? 'i' : '';
      const missing = (c.patterns ?? []).filter((p) => !new RegExp(p, flags).test(text));
      return missing.length
        ? { passed: false, message: `${c.file} does not match: ${missing.join(' | ')}` }
        : { passed: true };
    },
  },

  not_contains: {
    required: ['file', 'patterns'],
    run(c, skillDir) {
      const text = readInSkill(skillDir, c.file);
      const flags = c.ignoreCase ? 'i' : '';
      const hits = (c.patterns ?? []).filter((p) => new RegExp(p, flags).test(text));
      return hits.length
        ? { passed: false, message: `${c.file} unexpectedly matches: ${hits.join(' | ')}` }
        : { passed: true };
    },
  },

  json_shape: {
    required: ['file', 'requiredKeys'],
    run(c, skillDir) {
      const parsed = JSON.parse(readInSkill(skillDir, c.file));
      const missing = (c.requiredKeys ?? []).filter((k) => getPath(parsed, k) === undefined);
      return missing.length
        ? { passed: false, message: `${c.file} missing keys: ${missing.join(', ')}` }
        : { passed: true };
    },
  },

  command: {
    required: ['cmd'],
    run(c, skillDir) {
      const expectExit = c.expectExitCode ?? 0;
      let stdout = '';
      let code = 0;
      try {
        stdout = execFileSync('bash', ['-c', c.cmd], {
          cwd: skillDir,
          encoding: 'utf8',
          timeout: c.timeoutMs ?? 60_000,
          env: { ...process.env, NO_COLOR: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        code = err.status ?? 1;
        stdout = `${err.stdout ?? ''}${err.stderr ?? ''}`;
        if (err.signal) return { passed: false, message: `command killed (${err.signal})` };
      }
      if (code !== expectExit) {
        return {
          passed: false,
          message: `exit ${code}, expected ${expectExit}\n${stdout.trim().split('\n').slice(-10).join('\n')}`,
        };
      }
      const missing = (c.expectStdout ?? []).filter((p) => !new RegExp(p).test(stdout));
      return missing.length
        ? { passed: false, message: `output does not match: ${missing.join(' | ')}` }
        : { passed: true };
    },
  },
};

/** Static shape check for a case, independent of running it. */
export function validateCaseShape(c) {
  const problems = [];
  const spec = CASE_TYPES[c.type];
  if (!spec) {
    problems.push(`unknown case type "${c.type}" (known: ${Object.keys(CASE_TYPES).join(', ')})`);
    return problems;
  }
  for (const field of spec.required) {
    if (c[field] === undefined) problems.push(`case type "${c.type}" requires field "${field}"`);
  }
  return problems;
}

/** Execute one case. Never throws — a thrown error is a failed case. */
export function runCase(c, skillDir) {
  const shape = validateCaseShape(c);
  if (shape.length) return { passed: false, message: shape.join('; ') };
  try {
    return CASE_TYPES[c.type].run(c, skillDir);
  } catch (err) {
    return { passed: false, message: err.message };
  }
}
