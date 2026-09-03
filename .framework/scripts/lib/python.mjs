// Runs a skill's Python tests and turns the measurements they emit into a perf report.
//
// Generated Python tests are unittest.TestCase subclasses, so they run under plain
// `python3 -m unittest` with nothing installed, and under pytest when the user has it.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './skills.mjs';

export const hasPython = () => spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0;

export const hasPytest = () =>
  spawnSync('python3', ['-c', 'import pytest'], { stdio: 'ignore' }).status === 0;

export function pythonTestsDir(config, skillDir) {
  return path.join(skillDir, config.python.testsDir);
}

/** Python modules the skill owns: top-level *.py files in its scripts/ dir. */
export function pythonModules(config, skillDir) {
  const dir = path.join(skillDir, config.python.dir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.py'))
    .map((e) => e.name.replace(/\.py$/, ''))
    .sort();
}

/** Does this skill own deterministic Python code? (scripts/ may also hold non-Python helpers) */
export function hasPythonCode(config, skillDir) {
  return pythonModules(config, skillDir).length > 0;
}

/**
 * Run one skill's Python tests.
 * @returns {{ran: boolean, passed: boolean, runner: string, output: string, measurements: object[]}}
 */
export function runPythonTests(config, skill, { root = REPO_ROOT } = {}) {
  const testsDir = pythonTestsDir(config, skill.dir);
  if (!hasPythonCode(config, skill.dir) || !fs.existsSync(testsDir)) {
    return { ran: false, passed: true, runner: 'none', output: '', measurements: [] };
  }
  if (!hasPython()) {
    return {
      ran: false,
      passed: false,
      runner: 'missing',
      output: 'python3 not found — install Python 3.11+ (setup/install.sh checks this)',
      measurements: [],
    };
  }

  const perfLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-perf-')), 'perf.ndjson');
  const wanted = config.python.runner === 'auto' ? (hasPytest() ? 'pytest' : 'unittest') : config.python.runner;
  const relTests = path.relative(skill.dir, testsDir);
  const args =
    wanted === 'pytest'
      ? ['-m', 'pytest', relTests, '-q']
      : ['-m', 'unittest', 'discover', '-s', relTests, '-t', relTests, '-v'];

  const env = {
    ...process.env,
    PYTHONPATH: [path.join(root, config.python.harnessPath), path.join(skill.dir, config.python.dir), skill.dir, process.env.PYTHONPATH]
      .filter(Boolean)
      .join(path.delimiter),
    PYTHONDONTWRITEBYTECODE: '1',
    SKILL_NAME: skill.name,
    SKILL_PERF_OUT: perfLog,
    NO_COLOR: '1',
  };

  let output = '';
  let passed = true;
  try {
    output = execFileSync('python3', args, {
      cwd: skill.dir,
      env,
      encoding: 'utf8',
      timeout: 10 * 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    passed = false;
    output = `${err.stdout ?? ''}${err.stderr ?? ''}` || err.message;
  }

  const measurements = fs.existsSync(perfLog)
    ? fs
        .readFileSync(perfLog, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
    : [];
  fs.rmSync(path.dirname(perfLog), { recursive: true, force: true });

  return { ran: true, passed, runner: wanted, output, measurements };
}

const perfFile = (config, skillName, root) => path.join(root, config.perf.stateDir, `${skillName}.json`);

export function readPerf(config, skillName, root = REPO_ROOT) {
  const file = perfFile(config, skillName, root);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { corrupt: true };
  }
}

/**
 * Compare a fresh set of measurements with the recorded ones.
 * Exponent growth is a real regression (structure changed); wall-clock is
 * machine-dependent, so it only ever warns.
 */
export function comparePerf(config, previous, measurements) {
  const findings = [];
  if (!previous || previous.corrupt) return findings;
  const before = new Map((previous.measurements ?? []).map((m) => [m.target, m]));

  for (const current of measurements) {
    const old = before.get(current.target);
    if (!old) continue;

    const grew = current.scaling.exponent - old.scaling.exponent;
    if (grew > config.perf.exponentTolerance) {
      findings.push({
        level: 'error',
        target: current.target,
        message: `scaling regressed: n^${old.scaling.exponent.toFixed(2)} (${old.scaling.class}) → n^${current.scaling.exponent.toFixed(2)} (${current.scaling.class})`,
      });
    }

    const oldPoint = (old.points ?? []).at(-1);
    const newPoint = (current.points ?? []).at(-1);
    if (oldPoint && newPoint && oldPoint.n === newPoint.n && oldPoint.seconds > 0) {
      const ratio = newPoint.seconds / oldPoint.seconds;
      if (ratio > config.perf.timeToleranceRatio) {
        findings.push({
          level: 'warn',
          target: current.target,
          message: `${ratio.toFixed(1)}x slower at n=${newPoint.n} (${oldPoint.seconds.toFixed(4)}s → ${newPoint.seconds.toFixed(4)}s) — could be this machine, check before ignoring`,
        });
      }
    }
  }
  return findings;
}

export function writePerf(config, skillName, { runner, measurements, ranAt }, root = REPO_ROOT) {
  const file = perfFile(config, skillName, root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ skill: skillName, runner, ranAt, measurements }, null, 2) + '\n',
  );
  return file;
}

/** Markdown: compute time and memory against input size, per measured target. */
export function perfTable(measurements) {
  if (measurements.length === 0) return '_no measurements recorded_';
  const lines = [];
  for (const m of measurements) {
    lines.push(`**${m.target}** — ${m.scaling.class}, time ~ n^${m.scaling.exponent} (R² ${m.scaling.rSquared}), memory ~ n^${m.scaling.memoryExponent}`);
    lines.push('');
    lines.push('| rows | seconds | items/s | peak KiB |');
    lines.push('|---:|---:|---:|---:|');
    for (const p of m.points) {
      lines.push(
        `| ${p.n.toLocaleString('en-US')} | ${p.seconds.toFixed(4)} | ${Math.round(p.items_per_second).toLocaleString('en-US')} | ${Math.round(p.peak_kib).toLocaleString('en-US')} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
