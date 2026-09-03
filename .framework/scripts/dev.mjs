#!/usr/bin/env node
// The friendly front door for people who do not use git.
//
//   npm run status     what is going on, in plain words
//   npm run start      begin a new piece of work on its own branch
//   npm run check      run every check (same ones the robots run)
//   npm run save       check, save, and upload your work
//   npm run ship       open a pull request for review
//   npm run doctor     make sure this computer is set up properly
//
// Every command explains what it is about to do before it does it, and refuses the
// two things that actually hurt: committing straight to main, and saving work that
// has not passed its checks.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Prompter } from './lib/prompt.mjs';
import { REPO_ROOT } from './lib/skills.mjs';
import { bold, dim, green, red, yellow } from './lib/report.mjs';

const MAIN = process.env.SKILL_MAIN_BRANCH || 'main';

const git = (args, { allowFail = false } = {}) => {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? '').trim();
};

const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const say = (text = '') => console.log(text);
const step = (text) => console.log(dim(`  → ${text}`));

const slug = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'work';

const currentBranch = () => git(['rev-parse', '--abbrev-ref', 'HEAD']);
const changedFiles = () => git(['status', '--porcelain']).split('\n').filter(Boolean);
const hooksWired = () => git(['config', 'core.hooksPath'], { allowFail: true }) === '.framework/hooks';

function runChecks({ quiet = false } = {}) {
  const result = spawnSync('node', ['.framework/scripts/verify-all.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: quiet ? '1' : process.env.NO_COLOR ?? '' },
    stdio: quiet ? 'pipe' : 'inherit',
  });
  return { passed: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

// --- commands ---------------------------------------------------------------

function status() {
  const branch = currentBranch();
  const changes = changedFiles();
  say(bold('Where you are'));
  say(`  Branch:  ${branch}${branch === MAIN ? yellow('  (this is the shared one — start a branch before changing anything)') : ''}`);
  say(`  Changes: ${changes.length === 0 ? 'nothing changed since your last save' : `${changes.length} file(s) changed`}`);
  for (const line of changes.slice(0, 12)) say(dim(`    ${line}`));
  if (changes.length > 12) say(dim(`    ...and ${changes.length - 12} more`));
  say(`  Safety checks: ${hooksWired() ? green('on') : red('OFF — run: npm run doctor')}`);

  say('');
  say(bold('What to do next'));
  if (branch === MAIN && changes.length) say('  npm run start "what you are working on"   (moves your work onto its own branch)');
  else if (changes.length) say('  npm run save     (checks your work, saves it, uploads it)');
  else if (branch !== MAIN) say('  npm run ship     (asks your reviewers to look at it)');
  else say('  npm run start "what you want to build"');
  return 0;
}

async function start(argv, prompter) {
  const description = argv.join(' ') || (await prompter.ask('what', 'What are you working on?', { default: 'a new skill' }));
  const branch = `skill/${slug(description)}`;

  if (currentBranch() !== MAIN) {
    say(yellow(`You are on "${currentBranch()}", not ${MAIN}.`));
    const move = await prompter.confirm('switch', `Start the new branch from ${MAIN} anyway? (your current work stays where it is)`, { default: true });
    if (!move) return 1;
  }

  say(bold(`Starting "${branch}"`));
  step(`fetching the latest ${MAIN}`);
  git(['fetch', 'origin', MAIN], { allowFail: true });
  step('creating your branch');
  git(['checkout', '-B', branch, `origin/${MAIN}`], { allowFail: true }) || git(['checkout', '-B', branch]);
  say(green(`\nYou are now on ${branch}. Everything you change is separate from ${MAIN} until it is reviewed.`));
  say(dim('Next: make your changes, then run  npm run save'));
  return 0;
}

async function save(argv, prompter) {
  const branch = currentBranch();
  if (branch === MAIN) {
    say(red(`You are on ${MAIN}, the shared branch. Work is never saved straight onto it.`));
    say(`Run:  npm run start "what you are working on"   then  npm run save`);
    return 1;
  }
  if (!hooksWired()) {
    say(yellow('Safety checks are not switched on for this copy of the repo. Fixing that first.'));
    execFileSync('bash', ['.framework/scripts/setup-hooks.sh'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  const changes = changedFiles();
  if (changes.length === 0) {
    say('Nothing has changed since your last save.');
    return 0;
  }

  say(bold('Checking your work before saving it'));
  const checks = runChecks();
  if (!checks.passed) {
    say(red('\nSomething is not right yet, so nothing was saved.'));
    say('Read the lines above: each one says which skill and what to run to fix it.');
    say(dim('Common fix: npm run regression -- <skill-name>   (re-runs that skill\'s tests and records the result)'));
    return 1;
  }

  const message = argv.join(' ') || (await prompter.ask('message', 'Describe what you did, in one line', { default: 'update skills' }));
  const conventional = /^(feat|fix|docs|chore|test|refactor)(\(.+\))?:/.test(message) ? message : `feat: ${message}`;

  say(bold('\nSaving'));
  step('bundling your changes');
  git(['add', '-A']);
  step('recording them with your message');
  git(['commit', '-m', conventional]);
  step('uploading to GitHub');
  const push = spawnSync('git', ['push', '-u', 'origin', branch], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (push.status !== 0) {
    say(red('Saved on this computer, but the upload failed:'));
    say(dim(push.stderr.trim()));
    say('Try again in a moment with:  npm run save');
    return 1;
  }
  say(green('\nSaved and uploaded.'));
  say(dim('Next: npm run ship   (asks your reviewers to look at it)'));
  return 0;
}

function reviewers() {
  const file = path.join(REPO_ROOT, '.framework/setup/reviewers.json');
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed.reviewers ?? [];
  } catch {
    return [];
  }
}

async function ship(argv, prompter) {
  const branch = currentBranch();
  if (branch === MAIN) {
    say(red(`You are on ${MAIN}. There is nothing to review — start a branch first.`));
    return 1;
  }
  if (changedFiles().length) {
    say(yellow('You have unsaved changes. Saving them first.'));
    const code = await save([], prompter);
    if (code !== 0) return code;
  }

  const title = argv.join(' ') || (await prompter.ask('title', 'Title for the review request', { default: branch.replace(/^skill\//, '').replace(/-/g, ' ') }));
  const people = reviewers();

  if (!has('gh')) {
    const remote = git(['remote', 'get-url', 'origin'], { allowFail: true }).replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
    say(yellow('The GitHub command line tool is not installed, so open the request in your browser:'));
    say(`  ${remote}/compare/${MAIN}...${branch}?expand=1`);
    say(dim('Or install it and run: bash .framework/setup/configure-gh.sh'));
    return 0;
  }

  say(bold('Opening a review request'));
  step(`asking GitHub to compare ${branch} with ${MAIN}`);
  const body = [
    '## What changed',
    '',
    title,
    '',
    '## Checks',
    '',
    'All local checks passed before this was uploaded (`npm run check`): skill format, rubric, regression suites, Python accuracy/edge/performance tests.',
    '',
    '_Opened with `npm run ship`._',
  ].join('\n');

  const args = ['pr', 'create', '--base', MAIN, '--head', branch, '--title', title, '--body', body];
  if (people.length) args.push('--reviewer', people.join(','));
  const result = spawnSync('gh', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    const existing = spawnSync('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (existing.status === 0 && existing.stdout.trim()) {
      say(green(`\nThis branch already has a review request open: ${existing.stdout.trim()}`));
      say(dim('Your new changes were added to it automatically.'));
      return 0;
    }
    say(red('Could not open the review request:'));
    say(dim((result.stderr || result.stdout).trim()));
    say(dim('If it mentions authentication, run: bash .framework/setup/configure-gh.sh'));
    return 1;
  }
  say(green(`\nReview request opened: ${result.stdout.trim()}`));
  if (people.length) say(dim(`Reviewers asked: ${people.join(', ')}`));
  else say(yellow('No reviewers are configured yet — run: bash .framework/setup/configure-gh.sh'));
  return 0;
}

// What each package manager calls the runtimes this repo needs.
const PKG_NAMES = {
  git: { brew: 'git', apt: 'git', winget: 'Git.Git' },
  node: { brew: 'node', apt: 'nodejs npm', winget: 'OpenJS.NodeJS.LTS' },
  python: { brew: 'python', apt: 'python3', winget: 'Python.Python.3.12' },
  gh: { brew: 'gh', apt: 'gh', winget: 'GitHub.cli' },
};

/** One copy-pasteable install command for the missing tools, using whatever
 *  package manager this machine has. Null when no manager (or nothing) is missing. */
export function installHint(tools, hasCmd = has) {
  if (tools.length === 0) return null;
  const managers = [
    { bin: 'brew', key: 'brew', cmd: (p) => `brew install ${p.join(' ')}` },
    { bin: 'apt-get', key: 'apt', cmd: (p) => `sudo apt-get update && sudo apt-get install -y ${p.join(' ')}` },
    { bin: 'winget', key: 'winget', cmd: (p) => p.map((x) => `winget install --id ${x}`).join(' && ') },
  ];
  for (const m of managers) {
    if (!hasCmd(m.bin)) continue;
    return m.cmd(tools.map((t) => PKG_NAMES[t][m.key]));
  }
  return null;
}

function doctor() {
  say(bold('Checking this computer\n'));
  const checks = [];
  const missingTools = [];
  const record = (label, ok, fix, tool) => {
    checks.push({ label, ok, fix });
    if (!ok && tool) missingTools.push(tool);
    say(`  ${ok ? green('ok  ') : red('miss')} ${label}${ok ? '' : dim(`  → ${fix}`)}`);
  };

  record('git is installed', has('git'), 'install git: https://git-scm.com/downloads', 'git');
  record('Node.js 22+ is installed', Number(process.versions.node.split('.')[0]) >= 22, 'install Node 22 or newer: https://nodejs.org', 'node');
  record('Python 3 is installed', spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0, 'install Python 3.11+: https://python.org', 'python');
  record('GitHub command line (optional)', has('gh'), 'install gh, then run: bash .framework/setup/configure-gh.sh', 'gh');

  const wired = hooksWired();
  if (!wired) {
    execFileSync('bash', ['.framework/scripts/setup-hooks.sh'], { cwd: REPO_ROOT, stdio: 'ignore' });
  }
  record('safety checks run before each save', hooksWired(), 'run: bash .framework/scripts/setup-hooks.sh');
  record('the hook script can run', fs.existsSync(path.join(REPO_ROOT, '.framework/hooks/pre-commit')), 'the file .framework/hooks/pre-commit is missing');
  record('reviewers are configured', reviewers().length > 0, 'run: bash .framework/setup/configure-gh.sh');
  record(
    'the test harness loads',
    spawnSync('python3', ['-c', 'import skillharness'], {
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONPATH: path.join(REPO_ROOT, '.framework/harness') },
      stdio: 'ignore',
    }).status === 0,
    'run from the repo folder, or reinstall with: npm run setup',
  );

  const missing = checks.filter((c) => !c.ok);
  say('');
  const hint = installHint(missingTools);
  if (hint) {
    say(yellow('One command installs the missing tools on this machine:'));
    say(`  ${hint}`);
    say(dim('Then run: npm run doctor   (to confirm everything is in place)'));
    say('');
  }
  say(missing.length === 0 ? green('Everything is set up.') : yellow(`${missing.length} thing(s) to sort out — the fix is on each line above.`));
  return missing.some((c) => ['git is installed', 'Node.js 22+ is installed'].includes(c.label)) ? 1 : 0;
}

function sync() {
  say(bold(`Bringing in the latest ${MAIN}`));
  step('downloading');
  git(['fetch', 'origin', MAIN], { allowFail: true });
  step('merging it into your branch');
  const merge = spawnSync('git', ['merge', `origin/${MAIN}`, '--no-edit'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (merge.status !== 0) {
    say(red('\nYour work and the latest main changed the same lines, so this needs a human decision.'));
    say('Ask in your team chat, or open the repo in Claude Code / Copilot and say: "resolve the merge conflict".');
    return 1;
  }
  say(green('\nUp to date.'));
  return 0;
}

const USAGE = `dev — the friendly commands

  npm run status              what is going on right now
  npm run start "topic"       begin work on its own branch
  npm run check               run every check
  npm run save "what I did"   check, save, upload
  npm run ship "title"        open a review request
  npm run sync                bring in the latest main
  npm run doctor              check this computer is set up
`;

async function main(argv) {
  const [command, ...rest] = argv;
  const prompter = new Prompter({});
  try {
    switch (command) {
      case 'status': return status();
      case 'start': return await start(rest, prompter);
      case 'save': return await save(rest, prompter);
      case 'ship': return await ship(rest, prompter);
      case 'sync': return sync();
      case 'doctor': return doctor();
      default:
        console.log(USAGE);
        return command ? 1 : 0;
    }
  } catch (err) {
    say(red(err.message));
    say(dim('If this is confusing, run: npm run doctor'));
    return 1;
  } finally {
    prompter.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
