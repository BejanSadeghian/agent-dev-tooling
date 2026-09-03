#!/usr/bin/env node
// Run a skill under development with a CLEAN sub-agent — a fresh Copilot CLI
// process with zero conversation context that reads the latest skill from disk.
// The agent that is developing a skill must never execute it in its own context:
// it already knows what the skill was meant to say, so it silently compensates
// for unclear instructions. A fresh process is the real test.
//
//   npm run subagent -- <use-case> "a realistic task"            # run the doer
//   npm run subagent -- <use-case> "..." --role interpreter      # run the interpreter
//   npm run subagent -- <use-case> "..." --discovery             # do not name the skill:
//                                                                # does the description trigger?
//
// The run transcript is captured under the skill's evals/runs/ (gitignored), then
// the deterministic checks judge what came out: the doer's artifact must parse and
// carry records + deviations; the interpreter's output must separate Facts from
// Interpretations.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, loadConfig } from './lib/skills.mjs';
import { bold, dim, green, red, yellow } from './lib/report.mjs';

function parseArgs(argv) {
  const args = { role: 'doer', discovery: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--role') args.role = argv[++i];
    else if (a === '--discovery') args.discovery = true;
    else args.rest.push(a);
  }
  [args.useCase, ...args.taskParts] = args.rest;
  args.task = args.taskParts.join(' ');
  return args;
}

function buildPrompt(config, { skillName, skillDir, task, discovery }) {
  if (discovery) {
    return [
      `You have a library of agent skills in ${path.join(REPO_ROOT, config.productSkillsDir)}/ —`,
      'each subdirectory is a skill whose SKILL.md frontmatter describes what it does and when to use it.',
      'Read the descriptions, pick the right skill for the task below, announce which one you chose, and follow it exactly.',
      '',
      `Task: ${task}`,
    ].join('\n');
  }
  return [
    `Read the skill at ${path.join(skillDir, 'SKILL.md')} and follow it exactly — its references,`,
    'schema, and scripts live in the same directory. Work from the repository root.',
    '',
    `Task: ${task}`,
  ].join('\n');
}

/** Deterministic post-run checks on what the sub-agent produced. */
function judge(config, { role, useCase }) {
  const findings = [];
  const outDir = path.join(REPO_ROOT, 'outputs');

  if (role === 'doer') {
    const artifact = path.join(outDir, `${useCase}.json`);
    if (!fs.existsSync(artifact)) {
      findings.push({ level: 'warn', message: `no artifact at outputs/${useCase}.json — check the transcript for where it wrote (or failed)` });
      return findings;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(artifact, 'utf8'));
      if (!Array.isArray(parsed.records)) findings.push({ level: 'error', message: 'artifact has no "records" array — it does not conform to the schema' });
      if (!Array.isArray(parsed.deviations)) findings.push({ level: 'error', message: 'artifact has no "deviations" array — the doer must report, never restructure' });
      if (findings.length === 0) findings.push({ level: 'ok', message: `outputs/${useCase}.json parses and carries records + deviations (${parsed.records.length} record(s), ${parsed.deviations.length} deviation(s))` });
    } catch (err) {
      findings.push({ level: 'error', message: `artifact is not valid JSON: ${err.message}` });
    }
    return findings;
  }

  const reading = path.join(outDir, `${useCase}-reading.md`);
  if (!fs.existsSync(reading)) {
    findings.push({ level: 'warn', message: `no output at outputs/${useCase}-reading.md — check the transcript for where it wrote (or failed)` });
    return findings;
  }
  const text = fs.readFileSync(reading, 'utf8');
  const facts = text.indexOf('## Facts');
  const interpretations = text.indexOf('## Interpretations');
  if (facts === -1) findings.push({ level: 'error', message: 'output has no "## Facts" section' });
  if (interpretations === -1) findings.push({ level: 'error', message: 'output has no "## Interpretations" section' });
  if (facts !== -1 && interpretations !== -1 && interpretations < facts) {
    findings.push({ level: 'error', message: 'Interpretations comes before Facts — the reader must meet the data before the opinion' });
  }
  if (findings.length === 0) findings.push({ level: 'ok', message: `outputs/${useCase}-reading.md separates Facts from Interpretations` });
  return findings;
}

function main(argv) {
  const args = parseArgs(argv);
  const config = loadConfig();

  if (!args.useCase || !args.task) {
    console.log('usage: npm run subagent -- <use-case> "a realistic task" [--role doer|interpreter] [--discovery]');
    return 1;
  }
  if (!['doer', 'interpreter'].includes(args.role)) {
    console.error(red(`unknown role "${args.role}" — doer or interpreter`));
    return 1;
  }

  const skillName = `${args.useCase}${config.roles.suffixes[args.role]}`;
  const skillDir = path.join(REPO_ROOT, config.productSkillsDir, skillName);
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    console.error(red(`no such skill: ${config.productSkillsDir}/${skillName}`));
    return 1;
  }

  const { bin, promptFlag, extraArgs } = config.subagent;
  if (spawnSync(bin, ['--version'], { stdio: 'ignore' }).error) {
    console.error(red(`the "${bin}" CLI is not installed — the clean sub-agent needs it.`));
    console.error('Install it with: npm install -g @github/copilot   (docs: https://docs.github.com/en/copilot/how-tos/copilot-cli) — or point .framework/framework.json "subagent.bin" at another agent CLI with a -p style prompt flag.');
    return 1;
  }

  const prompt = buildPrompt(config, { skillName, skillDir, task: args.task, discovery: args.discovery });
  console.log(bold(`Clean sub-agent run — ${skillName}${args.discovery ? ' (discovery mode: the skill is not named)' : ''}`));
  console.log(dim('A fresh process with no conversation context, reading the latest skill from disk.\n'));

  const started = Date.now();
  const result = spawnSync(bin, [...(config.subagent.preArgs ?? []), promptFlag, prompt, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15 * 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const runsDir = path.join(skillDir, config.evals.runsDir);
  fs.mkdirSync(runsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(runsDir, `${stamp}${args.discovery ? '-discovery' : ''}.md`);
  fs.writeFileSync(
    logFile,
    `# Sub-agent run — ${skillName}\n\n- when: ${stamp}\n- mode: ${args.discovery ? 'discovery (skill not named)' : 'injection (skill named by path)'}\n- exit: ${result.status}\n- seconds: ${seconds}\n\n## Prompt\n\n\`\`\`\n${prompt}\n\`\`\`\n\n## Transcript\n\n\`\`\`\n${output}\n\`\`\`\n`,
  );

  console.log(output.trim());
  console.log(dim(`\ntranscript: ${path.relative(REPO_ROOT, logFile)} (${seconds}s, exit ${result.status})`));

  console.log(bold('\nDeterministic checks on what it produced'));
  const findings = judge(config, args);
  for (const f of findings) {
    const mark = f.level === 'ok' ? green('ok  ') : f.level === 'warn' ? yellow('warn') : red('fail');
    console.log(`  ${mark} ${f.message}`);
  }
  console.log(dim('\nFold what you learned back into the skill AND into a regression case, then re-run.'));
  return result.status !== 0 || findings.some((f) => f.level === 'error') ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
