// skill.json — what a skill declares about itself: its kind, the artifacts it
// produces, the deterministic Python it owns, and its place in a sequence.
// The validator uses it to prove every artifact and every Python entrypoint is
// actually covered by tests.
import fs from 'node:fs';
import path from 'node:path';

/** Read skill.json. Returns { manifest, problems } — never throws. */
export function readManifest(config, skillDir) {
  const file = path.join(skillDir, config.manifest.file);
  if (!fs.existsSync(file)) {
    return { manifest: null, problems: [{ message: `missing ${config.manifest.file}` }] };
  }
  try {
    return { manifest: JSON.parse(fs.readFileSync(file, 'utf8')), problems: [] };
  } catch (err) {
    return { manifest: null, problems: [{ message: `${config.manifest.file}: invalid JSON — ${err.message}` }] };
  }
}

/** Structural checks on the manifest itself. */
export function validateManifest(config, skill, manifest) {
  const problems = [];
  const spec = config.manifest;
  const where = spec.file;

  for (const field of spec.requiredFields) {
    if (manifest[field] === undefined) problems.push({ message: `${where}: missing "${field}"`, where });
  }
  if (manifest.name !== undefined && manifest.name !== skill.name) {
    problems.push({ message: `${where}: name "${manifest.name}" does not match directory "${skill.name}"`, where });
  }
  if (manifest.kind !== undefined && !spec.kinds.includes(manifest.kind)) {
    problems.push({ message: `${where}: unknown kind "${manifest.kind}" (${spec.kinds.join(', ')})`, where });
  }

  const artifacts = manifest.artifacts ?? [];
  if (!Array.isArray(artifacts)) {
    problems.push({ message: `${where}: "artifacts" must be an array (use [] when the skill produces none)`, where });
    return problems;
  }

  const ids = new Set();
  for (const artifact of artifacts) {
    for (const field of spec.artifact.requiredFields) {
      if (artifact[field] === undefined) {
        problems.push({ message: `${where}: artifact ${artifact.id ?? '<unnamed>'} missing "${field}"`, where });
      }
    }
    if (artifact.id !== undefined) {
      if (!new RegExp(spec.artifact.idPattern).test(artifact.id)) {
        problems.push({ message: `${where}: artifact id "${artifact.id}" must match ${spec.artifact.idPattern}`, where });
      }
      if (ids.has(artifact.id)) problems.push({ message: `${where}: duplicate artifact id "${artifact.id}"`, where });
      ids.add(artifact.id);
    }
    if (artifact.kind !== undefined && !spec.artifact.kinds.includes(artifact.kind)) {
      problems.push({
        message: `${where}: artifact "${artifact.id}" has unknown kind "${artifact.kind}" (${spec.artifact.kinds.join(', ')})`,
        where,
      });
    }
    if (artifact.generate === false && !artifact.skipReason) {
      problems.push({
        message: `${where}: artifact "${artifact.id}" is switched off ("generate": false) but gives no "skipReason" — record why, so the next reader knows it was a decision`,
        where,
      });
    }
  }

  const python = manifest.python;
  if (python) {
    for (const entrypoint of python.entrypoints ?? []) {
      if (typeof entrypoint !== 'string' || !entrypoint.includes('.')) {
        problems.push({ message: `${where}: python entrypoint "${entrypoint}" must be "module.function"`, where });
        continue;
      }
      const [moduleName] = entrypoint.split('.');
      const moduleFile = path.join(skill.dir, config.python.dir, `${moduleName}.py`);
      if (!fs.existsSync(moduleFile)) {
        problems.push({ message: `${where}: python entrypoint "${entrypoint}" has no module at ${config.python.dir}/${moduleName}.py`, where });
      }
    }
  }

  return problems;
}

/** Artifacts that must be covered by tests (i.e. not switched off). */
export function activeArtifacts(manifest) {
  return (manifest?.artifacts ?? []).filter((a) => a.generate !== false);
}

/**
 * What each test declares it covers.
 * JSON cases:  { "kind": "accuracy", "covers": ["artifact-id", "module.function"] }
 * Python tests: module-level `KIND = "accuracy"` and `COVERS = ["artifact-id"]`
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

/** Coverage gaps: [{ target, kind, why }] for artifacts and Python entrypoints. */
export function coverageGaps(config, skillDir, manifest, cases) {
  if (!manifest) return [];
  const coverage = collectCoverage(config, skillDir, cases);
  const gaps = [];

  for (const artifact of activeArtifacts(manifest)) {
    const have = coverage.get(artifact.id) ?? new Set();
    const required = artifact.testKinds ?? config.coverage.requireKindsForArtifacts;
    for (const kind of required) {
      if (!have.has(kind)) gaps.push({ target: artifact.id, kind, why: 'artifact' });
    }
  }

  for (const entrypoint of manifest.python?.entrypoints ?? []) {
    const have = coverage.get(entrypoint) ?? new Set();
    for (const kind of config.coverage.requireKindsForPython) {
      if (!have.has(kind)) gaps.push({ target: entrypoint, kind, why: 'python' });
    }
  }

  return gaps;
}
