#!/usr/bin/env node
// Runs each skill's regression suite — the JSON cases plus, when the skill owns
// deterministic Python code, its Python tests (accuracy, edge cases, performance)
// — and records the result in .skill-state/<skill>.json plus the performance
// report in .skill-state/perf/<skill>.json.
//
// Usage: node scripts/run-regression.mjs [skill-name ...] [--no-record] [--json] [--skip-python]
import { runCase } from './lib/cases.mjs';
import { comparePerf, hasPythonCode, perfTable, readPerf, runPythonTests, writePerf } from './lib/python.mjs';
import { REPO_ROOT, discoverSkills, hashSkill, loadCases, loadConfig, writeState } from './lib/skills.mjs';
import { bold, dim, green, red, yellow } from './lib/report.mjs';

export function runSkillSuite(config, skill, { root = REPO_ROOT, skipPython = false } = {}) {
  const { cases, problems } = loadCases(config, skill.dir);
  const results = problems.map((p) => ({
    id: p.file,
    description: 'case file could not be loaded',
    passed: false,
    message: p.message,
  }));

  for (const c of cases) {
    const outcome = runCase(c, skill.dir);
    results.push({
      id: c.id,
      description: c.description,
      type: c.type,
      kind: c[config.coverage.caseKindField],
      passed: outcome.passed,
      message: outcome.message,
    });
  }

  if (cases.length < config.evals.minCases) {
    results.push({
      id: 'suite-exists',
      description: `at least ${config.evals.minCases} regression case(s)`,
      passed: false,
      message: `found ${cases.length}`,
    });
  }

  // Python tests: accuracy + edge + performance for the skill's deterministic code.
  let measurements = [];
  let perfFindings = [];
  let runner = 'none';
  if (!skipPython && hasPythonCode(config, skill.dir)) {
    const python = runPythonTests(config, skill, { root });
    runner = python.runner;
    measurements = python.measurements;
    if (python.ran || !python.passed) {
      results.push({
        id: 'python-tests',
        description: `Python tests (${python.runner})`,
        type: 'python',
        passed: python.passed,
        message: python.passed ? undefined : python.output.trim().split('\n').slice(-25).join('\n'),
      });
    }
    perfFindings = comparePerf(config, readPerf(config, skill.name, root), measurements);
    for (const finding of perfFindings.filter((f) => f.level === 'error')) {
      results.push({
        id: `perf:${finding.target}`,
        description: 'performance did not regress against the recorded run',
        type: 'perf',
        passed: false,
        message: finding.message,
      });
    }
  }

  return {
    skill: skill.name,
    contentHash: hashSkill(skill.dir),
    passed: results.every((r) => r.passed),
    total: results.length,
    failed: results.filter((r) => !r.passed).length,
    results,
    measurements,
    perfFindings,
    runner,
  };
}

function main(argv) {
  const record = !argv.includes('--no-record');
  const json = argv.includes('--json');
  const skipPython = argv.includes('--skip-python');
  const only = argv.filter((a) => !a.startsWith('--'));
  const config = loadConfig();
  const skills = discoverSkills(config).filter((s) => only.length === 0 || only.includes(s.name));

  if (only.length && skills.length === 0) {
    console.error(`no such skill: ${only.join(', ')}`);
    return 1;
  }

  const ranAt = new Date().toISOString();
  const runs = skills.map((s) => runSkillSuite(config, s, { skipPython }));

  if (record) {
    for (const run of runs) {
      writeState(config, run.skill, {
        skill: run.skill,
        contentHash: run.contentHash,
        passed: run.passed,
        total: run.total,
        failed: run.failed,
        ranAt,
        cases: run.results.map(({ id, passed, kind }) => ({ id, passed, ...(kind ? { kind } : {}) })),
      });
      if (run.measurements.length) {
        writePerf(config, run.skill, { runner: run.runner, measurements: run.measurements, ranAt });
      }
    }
  }

  if (json) {
    console.log(JSON.stringify(runs, null, 2));
    return runs.every((r) => r.passed) ? 0 : 1;
  }

  console.log(bold('skill regression'));
  for (const run of runs) {
    const head = run.passed ? green('PASS') : red('FAIL');
    console.log(`${head} ${run.skill} ${dim(`(${run.total - run.failed}/${run.total})`)}`);
    for (const r of run.results) {
      if (r.passed) console.log(`  ${green('ok')}   ${r.id} ${dim(r.description ?? '')}`);
      else console.log(`  ${red('fail')} ${r.id} — ${r.message}`);
    }
    for (const f of run.perfFindings.filter((f) => f.level === 'warn')) {
      console.log(`  ${yellow('warn')} ${f.target} — ${f.message}`);
    }
    if (run.measurements.length) {
      console.log(dim(perfTable(run.measurements).split('\n').map((l) => `  ${l}`).join('\n')));
    }
  }
  if (record) console.log(dim(`\nrecorded ${runs.length} run(s) in ${config.rubric.stateDir}/`));
  return runs.every((r) => r.passed) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
