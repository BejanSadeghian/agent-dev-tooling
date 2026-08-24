#!/usr/bin/env node
// Runs only the Python side: each skill's accuracy, edge-case, and performance
// tests, then prints the performance report (compute time and memory against
// input size). Recording is what `run-regression.mjs` does; this is for the
// fast inner loop while writing Python.
//
// Usage: node scripts/run-python-tests.mjs [skill-name ...] [--verbose] [--json]
import { hasPython, hasPythonCode, perfTable, runPythonTests } from './lib/python.mjs';
import { discoverSkills, loadConfig } from './lib/skills.mjs';
import { bold, dim, green, red } from './lib/report.mjs';

function main(argv) {
  const verbose = argv.includes('--verbose');
  const json = argv.includes('--json');
  const only = argv.filter((a) => !a.startsWith('--'));
  const config = loadConfig();
  const skills = discoverSkills(config)
    .filter((s) => only.length === 0 || only.includes(s.name))
    .filter((s) => hasPythonCode(config, s.dir));

  if (skills.length === 0) {
    console.log('no skills with Python code' + (only.length ? ` matching: ${only.join(', ')}` : ''));
    return 0;
  }
  if (!hasPython()) {
    console.error('python3 not found — run: bash setup/install.sh');
    return 1;
  }

  const runs = skills.map((skill) => ({ skill: skill.name, ...runPythonTests(config, skill) }));

  if (json) {
    console.log(JSON.stringify(runs, null, 2));
    return runs.every((r) => r.passed) ? 0 : 1;
  }

  console.log(bold('python tests'));
  for (const run of runs) {
    console.log(`${run.passed ? green('PASS') : red('FAIL')} ${run.skill} ${dim(`(${run.runner})`)}`);
    if (!run.passed || verbose) console.log(run.output.trim().split('\n').map((l) => `  ${l}`).join('\n'));
    if (run.measurements.length) {
      console.log(bold('\n  performance — time and memory vs input size'));
      console.log(perfTable(run.measurements).split('\n').map((l) => `  ${l}`).join('\n'));
    }
  }
  return runs.every((r) => r.passed) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
