// The doer/interpreter pair: role detection by name suffix, pairing, and the
// coverage each role owes. Replaces the old skill.json manifest — everything a
// skill "declares" now comes from its name, its files, and its schema.
import fs from 'node:fs';
import path from 'node:path';
import { pythonModules } from './python.mjs';

/**
 * Role of a skill: 'doer' | 'interpreter' | 'tool' | null.
 * Skills under a root listed in roles.requireRoleIn MUST carry a role suffix
 * (null means: product skill with no recognisable role — a format error).
 * Skills elsewhere (the dev tools in .github/skills) are role-exempt: 'tool'.
 */
export function roleOf(config, skill) {
  const { suffixes, requireRoleIn } = config.roles;
  for (const [role, suffix] of Object.entries(suffixes)) {
    if (skill.name.endsWith(suffix)) return role;
  }
  return requireRoleIn.includes(skill.root) ? null : 'tool';
}

/** The use case a paired skill belongs to: its name minus the role suffix. */
export function useCaseOf(config, name) {
  for (const suffix of Object.values(config.roles.suffixes)) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}

/** The name of the other half of the pair, or null for unpaired roles. */
export function counterpartName(config, skill) {
  const role = roleOf(config, skill);
  const { suffixes } = config.roles;
  if (role === 'doer') return useCaseOf(config, skill.name) + suffixes.interpreter;
  if (role === 'interpreter') return useCaseOf(config, skill.name) + suffixes.doer;
  return null;
}

/** Missing-counterpart warnings across the whole library. */
export function pairFindings(config, skills) {
  const names = new Set(skills.map((s) => s.name));
  const findings = [];
  for (const skill of skills) {
    const other = counterpartName(config, skill);
    if (other && !names.has(other)) {
      const role = roleOf(config, skill);
      findings.push({
        level: 'warn',
        skill: skill.name,
        message: `has no ${role === 'doer' ? 'interpreter' : 'doer'} — every use case ships as a pair (expected ${other})`,
      });
    }
  }
  return findings;
}

/** The doer's structured artifact, as a coverage target: the use-case name. */
export function artifactTarget(config, skill) {
  return useCaseOf(config, skill.name);
}

export function schemaPath(config, skillDir) {
  return path.join(skillDir, config.roles.doer.schemaFile);
}

/**
 * What each test declares it covers.
 * JSON cases:  { "kind": "accuracy", "covers": ["target", "module.function"] }
 * Python tests: module-level `KIND = "accuracy"` and `COVERS = ["target"]`
 */
export function collectCoverage(config, skillDir, cases = []) {
  const map = new Map(); // target -> Set(kind)
  const add = (target, kind) => {
    if (!target || !kind) return;
    if (!map.has(target)) map.set(target, new Set());
    map.get(target).add(kind);
  };

  const { caseKindField, caseCoversField, pythonMarkers } = config.coverage;
  for (const c of cases) {
    for (const target of c[caseCoversField] ?? []) add(target, c[caseKindField]);
  }

  const testsDir = path.join(skillDir, config.python.testsDir);
  if (fs.existsSync(testsDir)) {
    const filePattern = new RegExp(config.python.testFilePattern);
    for (const entry of fs.readdirSync(testsDir)) {
      if (!filePattern.test(entry)) continue;
      const text = fs.readFileSync(path.join(testsDir, entry), 'utf8');
      const kind = new RegExp(`^${pythonMarkers.kind}\\s*=\\s*["']([a-z]+)["']`, 'm').exec(text)?.[1];
      const coversRaw = new RegExp(`^${pythonMarkers.covers}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(text)?.[1] ?? '';
      const covers = [...coversRaw.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
      for (const target of covers) add(target, kind);
    }
  }

  return map;
}

const kindsFor = (coverage, matches) => {
  const have = new Set();
  for (const [target, kinds] of coverage) {
    if (matches(target)) for (const k of kinds) have.add(k);
  }
  return have;
};

/**
 * Coverage gaps: [{ target, kind, why }] — 'artifact' for the doer's structured
 * output, 'python' for each deterministic module in scripts/. A module counts as
 * covered by targets "module" or "module.function". Only doers owe the full
 * three-kind regime; other roles owe nothing here (their evals are structural).
 */
export function coverageGaps(config, skill, cases) {
  if (roleOf(config, skill) !== 'doer') return [];
  const coverage = collectCoverage(config, skill.dir, cases);
  const gaps = [];

  const artifact = artifactTarget(config, skill);
  const haveArtifact = kindsFor(coverage, (t) => t === artifact);
  for (const kind of config.coverage.requireKindsForArtifacts) {
    if (!haveArtifact.has(kind)) gaps.push({ target: artifact, kind, why: 'artifact' });
  }

  for (const module of pythonModules(config, skill.dir)) {
    const have = kindsFor(coverage, (t) => t === module || t.startsWith(`${module}.`));
    for (const kind of config.coverage.requireKindsForPython) {
      if (!have.has(kind)) gaps.push({ target: module, kind, why: 'python' });
    }
  }

  return gaps;
}
