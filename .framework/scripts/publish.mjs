#!/usr/bin/env node
// Ship a finished pair to a target repo. Skills are DEVELOPED here and USED
// elsewhere: when a pair is green, this copies it out of skills/ into the
// target's skills folder (default: .github/skills/, where Copilot discovers it),
// on a branch, with a pull request when the target is a remote repo.
//
//   npm run publish -- <use-case>                    # to the default target
//   npm run publish -- <use-case> --target staging   # to a named target
//
// Targets live in .framework/targets.json (per-clone, gitignored):
//   { "targets": { "prod": { "repo": "git@github.com:org/repo.git", "dest": ".github/skills", "default": true },
//                  "local": { "repo": "../consuming-repo" } } }
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT, discoverSkills, loadConfig } from './lib/skills.mjs';
import { bold, dim, green, red, yellow } from './lib/report.mjs';

function loadTargets(config) {
  const file = path.join(REPO_ROOT, config.ship.targetsFile);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).targets ?? null;
  } catch {
    return null;
  }
}

function copySkill(srcDir, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes('runs') && !path.basename(src).startsWith('.DS_Store'),
  });
}

const CONSUMER_README = (config) => `# Skills

Skills shipped from the skill development environment. Each use case is a pair:

- \`<use-case>${config.roles.suffixes.doer}\` — deterministic, procedural: turns input data into one
  structured artifact whose shape is fixed by its \`references/schema.md\`. Deviations from the
  ideal input are reported in the artifact's \`deviations\` field, never absorbed into a new shape.
- \`<use-case>${config.roles.suffixes.interpreter}\` — reads that artifact and produces a two-part output:
  **Facts** (each traceable to the artifact), then **Interpretations** (judgment applying the
  skill's lens). Check its \`references/variations/\` for domain/regional adaptations.

Run the doer before the interpreter. Do not edit these skills here — changes are made in the
development environment and shipped as a new version.
`;

function main(argv) {
  const targetFlag = argv.indexOf('--target');
  const targetName = targetFlag === -1 ? null : argv[targetFlag + 1];
  const useCase = argv.filter((a, i) => !a.startsWith('-') && i !== targetFlag + 1)[0];
  const config = loadConfig();

  if (!useCase) {
    console.log('usage: npm run publish -- <use-case> [--target <name>]');
    return 1;
  }

  const targets = loadTargets(config);
  if (!targets) {
    console.error(red(`no ${config.ship.targetsFile} yet — create it, e.g.:`));
    console.error(dim(JSON.stringify({ targets: { prod: { repo: 'git@github.com:org/repo.git', dest: '.github/skills', default: true } } }, null, 2)));
    return 1;
  }
  const name = targetName ?? Object.keys(targets).find((k) => targets[k].default) ?? Object.keys(targets)[0];
  const target = targets[name];
  if (!target) {
    console.error(red(`no such target "${targetName}" — known: ${Object.keys(targets).join(', ')}`));
    return 1;
  }
  const dest = target.dest ?? config.ship.defaultDest;

  const skills = discoverSkills(config).filter(
    (s) => s.root === config.productSkillsDir && Object.values(config.roles.suffixes).some((suffix) => s.name === `${useCase}${suffix}`),
  );
  if (skills.length === 0) {
    console.error(red(`no skills for use case "${useCase}" in ${config.productSkillsDir}/`));
    return 1;
  }
  if (skills.length === 1) {
    console.log(yellow(`shipping an incomplete pair: only ${skills[0].name} exists (the pair rule warns, it does not block)`));
  }

  console.log(bold(`Checking the pair is green before it ships`));
  const gate = spawnSync('node', ['.framework/scripts/verify-all.mjs', ...skills.map((s) => s.name)], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (gate.status !== 0) {
    console.error(red('\nNot shipped: the checks above failed. A skill ships green or not at all.'));
    return 1;
  }

  const isRemote = /^(git@|https?:\/\/|ssh:\/\/)/.test(target.repo);
  const workdir = isRemote ? fs.mkdtempSync(path.join(os.tmpdir(), 'skill-ship-')) : path.resolve(REPO_ROOT, target.repo);

  if (isRemote) {
    console.log(bold(`\nCloning ${target.repo}`));
    execFileSync('git', ['clone', '--depth', '1', target.repo, workdir], { stdio: 'inherit' });
  } else if (!fs.existsSync(workdir)) {
    console.error(red(`target path does not exist: ${workdir}`));
    return 1;
  }

  const branch = `skill/${useCase}`;
  const isGit = fs.existsSync(path.join(workdir, '.git'));
  if (isGit) execFileSync('git', ['checkout', '-B', branch], { cwd: workdir, stdio: 'inherit' });

  for (const skill of skills) {
    const destDir = path.join(workdir, dest, skill.name);
    copySkill(skill.dir, destDir);
    console.log(green(`  shipped ${skill.name} -> ${path.join(dest, skill.name)}`));
  }
  const readme = path.join(workdir, dest, 'README.md');
  if (!fs.existsSync(readme)) {
    fs.mkdirSync(path.dirname(readme), { recursive: true });
    fs.writeFileSync(readme, CONSUMER_README(config));
    console.log(green(`  shipped ${path.join(dest, 'README.md')} — the framework guide for whatever agent lands there`));
  }

  if (!isGit) {
    console.log(green(`\nCopied into ${workdir}. It is not a git repo, so review and commit it there yourself.`));
    return 0;
  }

  execFileSync('git', ['add', '-A', dest], { cwd: workdir, stdio: 'inherit' });
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: workdir });
  if (staged.status === 0) {
    console.log(yellow('\nNothing changed — the target already has this exact version.'));
    return 0;
  }
  execFileSync('git', ['commit', '-m', `feat(skills): ship ${useCase} pair`], { cwd: workdir, stdio: 'inherit' });

  if (!isRemote) {
    console.log(green(`\nCommitted on branch ${branch} in ${workdir}. Push and open the PR from there when ready.`));
    return 0;
  }

  console.log(bold('\nPushing and opening the pull request'));
  execFileSync('git', ['push', '-u', 'origin', branch, '--force-with-lease'], { cwd: workdir, stdio: 'inherit' });
  const pr = spawnSync(
    'gh',
    ['pr', 'create', '--fill', '--title', `Ship skills: ${useCase}`, '--body', `Ships the \`${useCase}\` doer/interpreter pair from the skill development environment. All checks were green at ship time.`],
    { cwd: workdir, encoding: 'utf8' },
  );
  if (pr.status === 0) console.log(green(`\nPull request opened: ${pr.stdout.trim()}`));
  else console.log(yellow(`\nPushed ${branch}; open the pull request by hand (gh said: ${(pr.stderr || pr.stdout).trim()})`));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
