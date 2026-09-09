// Regression-test executors. Every test type is deterministic and offline:
// a test that can flake is not a regression test.
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

export const TEST_TYPES = {
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
          passed: false, message: `exit ${code}, expected ${expectExit}\n${stdout.trim().split('\n').slice(-10).join('\n')}`,
        };
      }
      const missing = (c.expectStdout ?? []).filter((p) => !new RegExp(p).test(stdout));
      return missing.length
        ? { passed: false, message: `output does not match: ${missing.join(' | ')}` }
        : { passed: true };
    },
  },

  // Data-driven test: run the doer's entry function on `input` and deep-compare
  // the produced artifact with `expected`. entry is "scripts/<module>.py:<function>".
  artifact: {
    required: ['entry', 'input', 'expected'],
    run(c, skillDir) {
      const [rel, fnName] = String(c.entry).split(':');
      if (!rel || !fnName) {
        return { passed: false, message: `entry must be "scripts/<module>.py:<function>", got "${c.entry}"` };
      }
      const abs = path.resolve(skillDir, rel);
      if (!abs.startsWith(path.resolve(skillDir)) || !abs.endsWith('.py')) {
        return { passed: false, message: `entry is not a Python module inside the skill: ${rel}` };
      }
      if (!fs.existsSync(abs)) return { passed: false, message: `no such entry module: ${rel}` };
      const driver = [
        'import json, sys, importlib.util',
        `sys.path.insert(0, ${JSON.stringify(path.dirname(abs))})`,
        `spec = importlib.util.spec_from_file_location("skill_entry", ${JSON.stringify(abs)})`,
        'mod = importlib.util.module_from_spec(spec)',
        'spec.loader.exec_module(mod)',
        `fn = getattr(mod, ${JSON.stringify(fnName)})`,
        'data = json.load(sys.stdin)',
        'out = fn(data)',
        'json.dump(out, sys.stdout, sort_keys=True, default=str)',
      ].join('; ');
      let stdout;
      try {
        stdout = execFileSync('python3', ['-c', driver], {
          cwd: skillDir,
          input: JSON.stringify(c.input),
          encoding: 'utf8',
          timeout: c.timeoutMs ?? 60_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        const tail = `${err.stderr ?? ''}${err.stdout ?? ''}`.trim().split('\n').slice(-8).join('\n');
        return { passed: false, message: `entry raised:${tail ? '\n' + tail : ' ' + err.message}`.slice(0, 800) };
      }
      let actual;
      try {
        actual = JSON.parse(stdout);
      } catch {
        return { passed: false, message: `entry did not return JSON: ${stdout.slice(0, 200)}` };
      }
      const diff = firstDiff(actual, c.expected, '$');
      return diff ? { passed: false, message: diff, actual } : { passed: true, actual };
    },
  },
};

/** First human-readable difference between actual and expected. Objects compare
 *  key-order-insensitively; arrays compare element-wise (records carry a total
 *  order, so position matters). */
function firstDiff(actual, expected, at) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${at}: expected an array, got ${kindOf(actual)}`;
    if (actual.length !== expected.length) {
      return `${at}: expected ${expected.length} item(s), got ${actual.length}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const d = firstDiff(actual[i], expected[i], `${at}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      return `${at}: expected an object, got ${kindOf(actual)}`;
    }
    for (const k of Object.keys(expected)) {
      if (!(k in actual)) return `${at}: missing key "${k}"`;
      const d = firstDiff(actual[k], expected[k], `${at}.${k}`);
      if (d) return d;
    }
    for (const k of Object.keys(actual)) {
      if (!(k in expected)) return `${at}: unexpected key "${k}"`;
    }
    return null;
  }
  if (!Object.is(actual, expected)) {
    return `${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}

function kindOf(v) {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
}

/** Static shape check for a test, independent of running it. */
export function validateTestShape(c) {
  const problems = [];
  const spec = TEST_TYPES[c.type];
  if (!spec) {
    problems.push(`unknown test type "${c.type}" (known: ${Object.keys(TEST_TYPES).join(', ')})`);
    return problems;
  }
  for (const field of spec.required) {
    if (c[field] === undefined) problems.push(`test type "${c.type}" requires field "${field}"`);
  }
  return problems;
}

/** Execute one test. Never throws — a thrown error is a failed test. */
export function runTest(c, skillDir) {
  const shape = validateTestShape(c);
  if (shape.length) return { passed: false, message: shape.join('; ') };
  try {
    return TEST_TYPES[c.type].run(c, skillDir);
  } catch (err) {
    return { passed: false, message: err.message };
  }
}
