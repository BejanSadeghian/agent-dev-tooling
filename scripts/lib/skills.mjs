// Shared discovery / hashing / state helpers for the skill toolchain.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function loadConfig(root = REPO_ROOT) {
  const file = path.join(root, 'skill.config.json');
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Every skill directory declared by the config, as { name, dir, root }. */
export function discoverSkills(config, root = REPO_ROOT) {
  const skills = [];
  for (const rel of config.skillsDirs) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const entries = fs
      .readdirSync(abs, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      skills.push({ name: entry.name, dir: path.join(abs, entry.name), root: rel });
    }
  }
  return skills;
}

/** Map a changed file path (repo-relative) back to the skill that owns it, or null. */
export function skillForPath(config, relPath) {
  const norm = relPath.split(path.sep).join('/');
  for (const rel of config.skillsDirs) {
    const prefix = `${rel.replace(/\/$/, '')}/`;
    if (!norm.startsWith(prefix)) continue;
    const name = norm.slice(prefix.length).split('/')[0];
    if (name && !name.startsWith('.')) return name;
  }
  return null;
}

/** All files under dir, relative to dir, sorted. */
export function listSkillFiles(dir) {
  const out = [];
  const walk = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(path.relative(dir, abs).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Content hash of a skill directory: sha256 over (relative path, file bytes) for
 * every file. Any edit -- SKILL.md, a reference, a case -- changes the hash, which
 * is what makes the "regression run after the last edit" rubric row meaningful.
 */
export function hashSkill(dir) {
  const h = createHash('sha256');
  for (const rel of listSkillFiles(dir)) {
    h.update(rel, 'utf8');
    h.update('\0');
    h.update(fs.readFileSync(path.join(dir, rel)));
    h.update('\0');
  }
  return h.digest('hex');
}

export function stateFile(config, skillName, root = REPO_ROOT) {
  return path.join(root, config.rubric.stateDir, `${skillName}.json`);
}

export function readState(config, skillName, root = REPO_ROOT) {
  const file = stateFile(config, skillName, root);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { corrupt: true };
  }
}

export function writeState(config, skillName, state, root = REPO_ROOT) {
  const file = stateFile(config, skillName, root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  return file;
}

/** Load every eval case for a skill, with parse errors surfaced as problems. */
export function loadCases(config, skillDir) {
  const casesDir = path.join(skillDir, config.evals.dir);
  const problems = [];
  const cases = [];
  if (!fs.existsSync(casesDir)) return { cases, problems, casesDir };
  const files = fs
    .readdirSync(casesDir)
    .filter((f) => f.endsWith(config.evals.extension))
    .sort();
  for (const f of files) {
    const abs = path.join(casesDir, f);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      problems.push({ file: f, message: `invalid JSON: ${err.message}` });
      continue;
    }
    for (const field of config.evals.requiredCaseFields) {
      if (parsed[field] === undefined || parsed[field] === '') {
        problems.push({ file: f, message: `case missing field "${field}"` });
      }
    }
    cases.push({ ...parsed, __file: f });
  }
  const seen = new Set();
  for (const c of cases) {
    if (c.id === undefined) continue;
    if (seen.has(c.id)) problems.push({ file: c.__file, message: `duplicate case id "${c.id}"` });
    seen.add(c.id);
  }
  return { cases, problems, casesDir };
}
