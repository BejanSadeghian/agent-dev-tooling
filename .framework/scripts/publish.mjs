#!/usr/bin/env node
// Ship a finished pair to a target repo. Skills are DEVELOPED here and USED
// elsewhere: this copies the pair out of skills/ into the target's skills folder
// (default: .github/skills/, where Copilot discovers it), on a branch, with a
// pull request when the target is a remote repo. The pre-ship checks warn, never
// block — failures print loudly and shipping continues; the human decides.
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
import { REPO_ROOT, TRANSIENT_DIRS, discoverSkills, loadConfig } from './lib/skills.mjs';
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

// Development-only provenance: it belongs in the workshop, never in the shipped
// skill. The consuming repo gets only what an agent needs to USE the skill.
// Transient run debris (caches, outputs) never ships either.
// Lists come from framework.json `ship.devOnlyNames` / `ship.devOnlyPaths`
// (names match any path segment; paths match from the skill root).
export function copySkill(srcDir, destDir, config = loadConfig()) {
  const devOnlyNames = new Set(config.ship?.devOnlyNames ?? []);
  const devOnlyPaths = config.ship?.devOnlyPaths ?? [];
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const parts = path.relative(srcDir, src).split(path.sep).filter(Boolean);
      if (parts.length === 0) return true;
      const rel = parts.join('/');
      if (devOnlyPaths.some((p) => rel === p || rel.startsWith(`${p}/`))) return false;
      return !parts.some((part) => devOnlyNames.has(part) || TRANSIENT_DIRS.has(part) || part.startsWith('.'));
    },
  });
}

const CONSUMER_README = (config) => `# Skills

Skills shipped from the skill development environment. Each use case is a pair:

- \`<use-case>${config.roles.suffixes.doer}\` — deterministic, procedural: turns input data into one
  structured artifact whose shape is fixed by its \`references/schema.md\`. Deviations from the
  ideal input are reported in the artifact's \`deviations\` field, never absorbed into a new shape.
- \`<use-case>${config.roles.suffixes.observer}\` — reads that artifact and produces a two-part output:
  **Facts** (each traceable to the artifact), then **Interpretations** (judgment applying the
  skill's lens). Check its \`references/variations/\` for domain/regional adaptations.

Run the doer before the observer. Do not edit these skills here — changes are made in the
development environment and shipped as a new version.
`;

function main(argv) {
  const targetFlag = argv.indexOf('--target');
  const targetName = targetFlag === -1 ? null : argv[targetFlag + 1];
  const overrideFlag = argv.indexOf('--override');
  const overrideReason = overrideFlag === -1 ? null : argv[overrideFlag + 1];
  const consumed = new Set([targetFlag, overrideFlag].filter((i) => i !== -1).map((i) => i + 1));
  const useCase = argv.filter((a, i) => !a.startsWith('-') && !consumed.has(i))[0];
  const config = loadConfig();

  if (!useCase) {
    console.log('usage: npm run publish -- <use-case> [--target <name>] [--override "reason"]');
    return 1;
  }
  if (overrideFlag !== -1 && !overrideReason) {
    console.error(red('an override needs a reason — it goes on the record: npm run publish -- <use-case> --override "why"'));
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

  console.log(bold(`Confirming the test state before anything ships`));
  const gate = spawnSync('node', ['.framework/scripts/verify-all.mjs', ...skills.map((s) => s.name)], { cwd: REPO_ROOT, stdio: 'inherit' });
  let overridden = false;
  const overrideBy = process.env.USER || process.env.USERNAME || 'unknown';
  if (gate.status !== 0) {
    // Checks warn, never block: the failures print above, publishing continues,
    // and the human decides. --override "reason" is optional — when given, the
    // reason goes on the record in the delivery commit and PR body.
    console.log(yellow('\nChecks did not confirm — publishing anyway (checks warn, never block).'));
    console.log(yellow('Fix what they name when you can (the usual fix: npm run regression -- <skill>).'));
    if (overrideReason) {
      overridden = true;
      console.log(yellow(`Reason on the record: "${overrideReason}" (by ${overrideBy})`));
    }
  }

  // Absorb "save": nothing ships that is not also safely on GitHub. Commit any
  // pending work on a branch (never main) and push it, quietly. The pre-commit
  // hook only warns, so no skip is needed here.
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
  if (dirty) {
    const branchNow = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
    if (branchNow === 'main') execFileSync('git', ['checkout', '-B', `skill/${useCase}`], { cwd: REPO_ROOT, stdio: 'inherit' });
    execFileSync('git', ['add', '-A'], { cwd: REPO_ROOT, stdio: 'inherit' });
    execFileSync('git', ['commit', '-m', `feat: ${useCase} — published${overridden ? ` (checks overridden by ${overrideBy}: ${overrideReason})` : ''}`], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    const pushed = spawnSync('git', ['push', '-u', 'origin', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (pushed.status !== 0) console.log(yellow('saved locally; the upload to GitHub failed — publish continues, push again later'));
    else console.log(green('your work is saved and uploaded'));
  }

  const isRemote = /^(git@|https?:\/\/|ssh:\/\/)/.test(target.repo);
  const workdir = isRemote ? fs.mkdtempSync(path.join(os.tmpdir(), 'skill-ship-')) : path.resolve(REPO_ROOT, target.repo);

  if (isRemote) {
    console.log(bold(`\nCloning ${target.repo}`));
    const cloned = spawnSync('git', ['clone', '--depth', '1', target.repo, workdir], { stdio: 'inherit' });
    if (cloned.status !== 0) {
      console.error(red('\nThe team repo would not let this account in — this is almost always missing access, not a mistake you made.'));
      console.error(green('Your work is already saved and uploaded to this workshop repo — nothing is lost.'));
      console.error(`Ask whoever gave you this task for access to ${target.repo}, then run: npm run publish -- ${useCase}`);
      return 1;
    }
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
  execFileSync('git', ['commit', '-m', `feat(skills): publish ${useCase} pair${overridden ? ' (checks overridden)' : ''}`], { cwd: workdir, stdio: 'inherit' });

  if (!isRemote) {
    console.log(green(`\nCommitted on branch ${branch} in ${workdir}. Push and open the PR from there when ready.`));
    return 0;
  }

  console.log(bold('\nPushing and opening the pull request'));
  const targetPush = spawnSync('git', ['push', '-u', 'origin', branch, '--force-with-lease'], { cwd: workdir, stdio: 'inherit' });
  if (targetPush.status !== 0) {
    console.error(red('\nThe team repo refused the upload — this is almost always missing WRITE access, not a mistake you made.'));
    console.error(green('Your work is already saved and uploaded to this workshop repo — nothing is lost.'));
    console.error(`Ask whoever gave you this task for write access to ${target.repo}, then run: npm run publish -- ${useCase}`);
    return 1;
  }
  const pr = spawnSync(
    'gh',
    ['pr', 'create', '--fill', '--title', `Ship skills: ${useCase}`, '--body', `Publishes the \`${useCase}\` doer/observer pair from the skill development environment. ${overridden ? `**Checks were overridden by ${overrideBy}:** ${overrideReason}` : 'All checks were green at publish time.'}`],
    { cwd: workdir, encoding: 'utf8' },
  );
  if (pr.status === 0) console.log(green(`\nPull request opened: ${pr.stdout.trim()}`));
  else console.log(yellow(`\nPushed ${branch}; open the pull request by hand (gh said: ${(pr.stderr || pr.stdout).trim()})`));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
