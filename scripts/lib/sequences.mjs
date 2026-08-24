// A sequence is an ordered chain of skills where each step consumes artifacts an
// earlier step produced. Splitting artifact generation across separate skills is
// what makes each step testable on its own; this file checks the chain still joins up.
import fs from 'node:fs';
import path from 'node:path';
import { readManifest } from './manifest.mjs';
import { REPO_ROOT, discoverSkills } from './skills.mjs';

/** Load sequences/*.json. */
export function loadSequences(config, root = REPO_ROOT) {
  const dir = path.join(root, config.sequences.dir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      try {
        return { file, ...JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) };
      } catch (err) {
        return { file, error: err.message };
      }
    });
}

/**
 * Check every sequence: the skills exist, the steps are ordered, and everything a
 * step consumes was produced upstream.
 * @returns {{level: 'error'|'warn', message: string, where: string}[]}
 */
export function checkSequences(config, root = REPO_ROOT) {
  const findings = [];
  const skills = discoverSkills(config, root);
  const manifests = new Map(
    skills.map((skill) => [skill.name, readManifest(config, skill.dir).manifest]).filter(([, m]) => m),
  );

  for (const sequence of loadSequences(config, root)) {
    const where = `${config.sequences.dir}/${sequence.file}`;
    if (sequence.error) {
      findings.push({ level: 'error', message: `invalid JSON — ${sequence.error}`, where });
      continue;
    }
    const steps = sequence.steps ?? [];
    if (steps.length === 0) {
      findings.push({ level: 'warn', message: 'sequence has no steps', where });
      continue;
    }

    const producedSoFar = new Set(sequence.inputs ?? []);
    steps.forEach((step, index) => {
      const skillName = typeof step === 'string' ? step : step.skill;
      const manifest = manifests.get(skillName);
      if (!manifest) {
        if (config.sequences.requireResolvableSkills) {
          findings.push({ level: 'error', message: `step ${index + 1} names "${skillName}", which is not a skill in this repo`, where });
        }
        return;
      }

      const declared = manifest.sequence ?? {};
      const consumes = (typeof step === 'object' && step.consumes) || declared.consumes || [];
      const produces = (typeof step === 'object' && step.produces) || declared.produces || (manifest.artifacts ?? []).map((a) => a.id);

      if (config.sequences.requireWiredArtifacts) {
        for (const input of consumes) {
          if (!producedSoFar.has(input)) {
            findings.push({
              level: 'error',
              message: `step ${index + 1} (${skillName}) consumes "${input}", which no earlier step produces — add the upstream skill, or list it in "inputs"`,
              where,
            });
          }
        }
      }

      const artifactIds = new Set((manifest.artifacts ?? []).map((a) => a.id));
      for (const output of produces) {
        if (artifactIds.size && !artifactIds.has(output)) {
          findings.push({
            level: 'warn',
            message: `step ${index + 1} (${skillName}) claims to produce "${output}", which is not in its ${config.manifest.file}`,
            where,
          });
        }
        producedSoFar.add(output);
      }
    });
  }

  return findings;
}

/** Artifact ids produced by more than one skill — a collision waiting to happen. */
export function duplicateArtifactIds(config, root = REPO_ROOT) {
  const owners = new Map();
  for (const skill of discoverSkills(config, root)) {
    const { manifest } = readManifest(config, skill.dir);
    for (const artifact of manifest?.artifacts ?? []) {
      if (!owners.has(artifact.id)) owners.set(artifact.id, []);
      owners.get(artifact.id).push(skill.name);
    }
  }
  return [...owners.entries()].filter(([, skills]) => skills.length > 1).map(([id, skills]) => ({ id, skills }));
}
