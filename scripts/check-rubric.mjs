#!/usr/bin/env node
// Rubric gate (RUBRIC.md rows R1-R7). Format validity plus: the regression suite
// exists, was run, was green, and was run AFTER the latest edit to the skill.
// Usage: node scripts/check-rubric.mjs [skill-name ...] [--json]
import { validateSkill } from './validate-skill.mjs';
import { coverageGaps, readManifest } from './lib/manifest.mjs';
import { hasPythonCode, readPerf } from './lib/python.mjs';
import { REPO_ROOT, discoverSkills, hashSkill, loadCases, loadConfig, readState } from './lib/skills.mjs';
import { bold, dim, printFindings } from './lib/report.mjs';

export function checkRubric(config, skill, root = REPO_ROOT) {
  const findings = validateSkill(config, skill).map((f) => ({ ...f, message: `format: ${f.message}` }));
  const err = (message, where) => findings.push({ level: 'error', message, where });
  const { rubric } = config;

  const { cases } = loadCases(config, skill.dir);
  if (cases.length < config.evals.minCases) {
    err(`R2 no regression cases (need >= ${config.evals.minCases})`, config.evals.dir);
    return findings; // R3-R5 are meaningless without a suite
  }

  // --- artifact + python test coverage (R8, R9) ------------------------------
  const { manifest } = readManifest(config, skill.dir);
  if (manifest && (rubric.requireArtifactCoverage || rubric.requirePythonCoverage)) {
    for (const gap of coverageGaps(config, skill.dir, manifest, cases)) {
      const row = gap.why === 'artifact' ? 'R8' : 'R9';
      const how =
        gap.why === 'artifact'
          ? `add a case with "kind": "${gap.kind}" and "covers": ["${gap.target}"]`
          : `add a Python test with KIND = "${gap.kind}" and COVERS = ["${gap.target}"]`;
      err(
        `${row} ${gap.why} "${gap.target}" has no ${gap.kind} test — ${how}, or run: npm run test:new -- ${skill.name}`,
        config.manifest.file,
      );
    }
  }

  const state = readState(config, skill.name, root);
  const stateRel = `${rubric.stateDir}/${skill.name}.json`;
  if (!state) {
    err(`R3 regression suite never run — run: npm run regression -- ${skill.name}`, stateRel);
    return findings;
  }
  if (state.corrupt) {
    err(`R3 ${stateRel} is not valid JSON — re-run the regression suite`, stateRel);
    return findings;
  }
  if (rubric.requireEvalsGreen && state.passed !== true) {
    err(`R4 last regression run failed (${state.failed}/${state.total} case(s)) at ${state.ranAt}`, stateRel);
  }
  if (rubric.requireEvalsFreshAfterEdit) {
    const current = hashSkill(skill.dir);
    if (current !== state.contentHash) {
      err(
        `R5 stale: skill edited after its last regression run (${state.ranAt}) — run: npm run regression -- ${skill.name}`,
        stateRel,
      );
    }
  }
  // --- performance measurements recorded (R10) -------------------------------
  const entrypoints = manifest?.python?.entrypoints ?? [];
  if (rubric.requirePerfMeasurements && entrypoints.length && hasPythonCode(config, skill.dir)) {
    const perf = readPerf(config, skill.name, root);
    const perfRel = `${config.perf.stateDir}/${skill.name}.json`;
    if (!perf || perf.corrupt) {
      err(`R10 no performance report — run: npm run regression -- ${skill.name}`, perfRel);
    } else {
      const measured = new Set((perf.measurements ?? []).map((m) => m.target));
      for (const entrypoint of entrypoints) {
        const fn = entrypoint.split('.').at(-1);
        if (!measured.has(fn) && !measured.has(entrypoint)) {
          err(`R10 "${entrypoint}" was never measured — its performance test must call self.measure(...)`, perfRel);
        }
      }
      for (const m of perf.measurements ?? []) {
        const budget = manifest.python?.maxExponent ?? config.perf.maxExponentDefault;
        if (m.scaling.exponent > budget) {
          err(
            `R10 "${m.target}" scales as n^${m.scaling.exponent} (${m.scaling.class}); budget is n^${budget}`,
            perfRel,
          );
        }
      }
    }
  }

  if (rubric.requireChangelogEntry && !cases.length) {
    err('R11 changelog entry required', 'CHANGELOG.md');
  }
  return findings;
}

function main(argv) {
  const json = argv.includes('--json');
  const only = argv.filter((a) => !a.startsWith('--'));
  const config = loadConfig();
  const skills = discoverSkills(config).filter((s) => only.length === 0 || only.includes(s.name));

  if (only.length && skills.length === 0) {
    console.error(`no such skill: ${only.join(', ')}`);
    return 1;
  }

  const results = skills.map((s) => ({ skill: s.name, findings: checkRubric(config, s) }));
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return results.some((r) => r.findings.some((f) => f.level !== 'warn')) ? 1 : 0;
  }

  console.log(bold('skill rubric'));
  let errors = 0;
  for (const r of results) errors += printFindings(r.skill, r.findings);
  console.log(
    errors
      ? `\n${errors} rubric failure(s) — see RUBRIC.md`
      : `\n${results.length} skill(s) meet the rubric ${dim('(RUBRIC.md R1-R7)')}`,
  );
  return errors ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
