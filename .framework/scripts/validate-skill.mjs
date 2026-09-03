#!/usr/bin/env node
// Format validator: does every skill match the framework spec (.framework/FRAMEWORK.md,
// as encoded in .framework/framework.json)? Layout, frontmatter, body, eval cases,
// and the doer/interpreter role rules.
// Usage: node .framework/scripts/validate-skill.mjs [skill-name ...] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from './lib/frontmatter.mjs';
import { validateCaseShape } from './lib/cases.mjs';
import { roleOf, schemaPath } from './lib/roles.mjs';
import { TRANSIENT_DIRS, discoverSkills, loadCases, loadConfig } from './lib/skills.mjs';
import { bold, printFindings } from './lib/report.mjs';

export function validateSkill(config, skill) {
  const findings = [];
  const err = (message, where) => findings.push({ level: 'error', message, where });
  const warn = (message, where) => findings.push({ level: 'warn', message, where });

  // --- layout ---------------------------------------------------------------
  for (const required of config.layout.requiredFiles) {
    if (!fs.existsSync(path.join(skill.dir, required))) err(`missing required file ${required}`);
  }
  for (const entry of fs.readdirSync(skill.dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (TRANSIENT_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    if (!config.layout.allowedDirs.includes(entry.name) && !config.layout.allowUnknownDirs) {
      err(`unexpected directory "${entry.name}/" (allowed: ${config.layout.allowedDirs.join(', ')})`);
    }
  }
  for (const required of config.layout.requiredDirs ?? []) {
    const abs = path.join(skill.dir, required);
    const hasFiles = fs.existsSync(abs) && fs.readdirSync(abs).some((f) => !f.startsWith('.'));
    if (!hasFiles) {
      err(`missing ${required}/ — the contract requires it with at least one file`);
    }
  }

  // --- role rules (the doer/interpreter pair) --------------------------------
  const role = roleOf(config, skill);
  if (role === null) {
    const suffixes = Object.values(config.roles.suffixes).join(' or ');
    err(`product skills must be one half of a pair — name it <use-case>${suffixes}`);
  }
  if (role === 'doer') {
    const schema = schemaPath(config, skill.dir);
    if (!fs.existsSync(schema)) {
      err(`doer has no ${config.roles.doer.schemaFile} — the artifact's shape must be committed, not invented at run time`);
    } else {
      const schemaText = fs.readFileSync(schema, 'utf8');
      for (const token of config.roles.doer.schemaMustContain) {
        if (!schemaText.includes(token)) {
          err(`${config.roles.doer.schemaFile} must define "${token}" — the doer reports deviations, it never invents a new shape`);
        }
      }
    }
    if (config.roles.doer.requireScripts) {
      const scriptsDir = path.join(skill.dir, 'scripts');
      const hasCode = fs.existsSync(scriptsDir) && fs.readdirSync(scriptsDir).some((f) => !f.startsWith('.'));
      if (!hasCode) err('doer has no scripts/ — its whole point is deterministic code producing the artifact');
    }
  }

  const skillMd = path.join(skill.dir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return findings;

  const raw = fs.readFileSync(skillMd, 'utf8');
  if (Buffer.byteLength(raw) > config.layout.maxSkillMdBytes) {
    err(`SKILL.md is ${Buffer.byteLength(raw)} bytes, max ${config.layout.maxSkillMdBytes}`, 'SKILL.md');
  }

  // --- frontmatter ----------------------------------------------------------
  let data = null;
  let body = raw;
  try {
    const parsed = readFrontmatter(raw);
    data = parsed.data;
    body = parsed.body;
  } catch (e) {
    err(`frontmatter: ${e.message}`, 'SKILL.md');
  }

  if (data === null) {
    err('SKILL.md has no YAML frontmatter', 'SKILL.md');
  } else {
    const fm = config.frontmatter;
    for (const key of fm.required) {
      if (data[key] === undefined || data[key] === '') err(`frontmatter missing "${key}"`, 'SKILL.md');
    }
    for (const key of Object.keys(data)) {
      if (!fm.allowed.includes(key)) err(`unknown frontmatter key "${key}"`, 'SKILL.md');
    }
    if (typeof data.name === 'string') {
      if (!new RegExp(fm.name.pattern).test(data.name)) {
        err(`name "${data.name}" must match ${fm.name.pattern}`, 'SKILL.md');
      }
      if (data.name.length > fm.name.maxLength) {
        err(`name is ${data.name.length} chars, max ${fm.name.maxLength}`, 'SKILL.md');
      }
      if (fm.name.mustMatchDirName && data.name !== skill.name) {
        err(`name "${data.name}" does not match directory "${skill.name}"`, 'SKILL.md');
      }
    }
    if (typeof data.description === 'string') {
      const d = data.description.trim();
      if (d.length < fm.description.minLength) {
        err(`description is ${d.length} chars, min ${fm.description.minLength}`, 'SKILL.md');
      }
      if (d.length > fm.description.maxLength) {
        err(`description is ${d.length} chars, max ${fm.description.maxLength}`, 'SKILL.md');
      }
      const triggers = fm.description.mustMatchOneOf ?? [];
      if (triggers.length && !triggers.some((t) => d.includes(t))) {
        err(`description needs a trigger clause (one of: ${triggers.join(', ')})`, 'SKILL.md');
      }
    }
  }

  // --- body -----------------------------------------------------------------
  for (const heading of config.body.requiredHeadings) {
    const re = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
    if (!re.test(body)) err(`SKILL.md missing required heading "${heading}"`, 'SKILL.md');
  }
  for (const pattern of config.body.forbiddenPatterns) {
    if (new RegExp(pattern).test(body)) {
      err(`SKILL.md contains forbidden pattern /${pattern}/`, 'SKILL.md');
    }
  }
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > config.body.maxWords) err(`SKILL.md body is ${words} words, max ${config.body.maxWords}`, 'SKILL.md');
  if (words > config.body.maxWords * 0.8 && words <= config.body.maxWords) {
    warn(`SKILL.md body is ${words} words — approaching the ${config.body.maxWords} cap`, 'SKILL.md');
  }

  if (role === 'interpreter') {
    for (const pattern of config.roles.interpreter.requiredBodyPatterns) {
      if (!new RegExp(pattern).test(body)) {
        err(
          `interpreter SKILL.md must match /${pattern}/ — its output separates facts from interpretation and names the doer's schema`,
          'SKILL.md',
        );
      }
    }
  }

  // --- regression cases -----------------------------------------------------
  const { cases, problems } = loadCases(config, skill.dir);
  for (const p of problems) err(p.message, `${config.evals.dir}/${p.file}`);
  if (cases.length < config.evals.minCases) {
    err(`${cases.length} regression case(s), min ${config.evals.minCases}`, config.evals.dir);
  }
  for (const c of cases) {
    for (const problem of validateCaseShape(c)) err(problem, `${config.evals.dir}/${c.__file}`);
    if (c[config.coverage.caseKindField] && !config.coverage.kinds.includes(c[config.coverage.caseKindField])) {
      err(
        `case "${c.id}" has unknown kind "${c[config.coverage.caseKindField]}" (${config.coverage.kinds.join(', ')})`,
        `${config.evals.dir}/${c.__file}`,
      );
    }
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

  const results = skills.map((s) => ({ skill: s.name, findings: validateSkill(config, s) }));
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return results.some((r) => r.findings.some((f) => f.level !== 'warn')) ? 1 : 0;
  }

  console.log(bold('skill format'));
  let errors = 0;
  for (const r of results) errors += printFindings(`${r.skill}`, r.findings);
  console.log(errors ? `\n${errors} format error(s)` : `\n${results.length} skill(s) valid`);
  return errors ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
