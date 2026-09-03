#!/usr/bin/env node
// Scenario evals: test the AGENT USING the skill, not just the skill's parts.
//
// A scenario is a committed folder under a skill: evals/scenarios/<name>/
//   scenario.json     the steps, prompts, and checkpoints
//   fixtures/         the starting workspace, copied into a fresh sandbox per trial
//
// Each trial stages the fixtures into a fresh sandbox, walks the steps in order
// (doer, then interpreter — later steps see what earlier steps actually produced),
// and evaluates checkpoints over the artifacts AND the transcript. Trials repeat
// (default 3) because a stochastic system proves nothing in one run; the machine
// verdict is strict (every checkpoint, every trial) and a HUMAN can override it,
// on the record, with a reason.
//
//   npm run scenario -- <use-case>                     # run every scenario for the pair
//   npm run scenario -- <use-case> <name>              # one scenario
//   npm run scenario -- <use-case> <name> --accept "reason"   # human override: pass
//   npm run scenario -- <use-case> <name> --reject "reason"   # human override: fail
//
// Results: one verdict per scenario, with a checkpoint × trial grid as evidence,
// written to .framework/state/scenarios/<skill-or-pair>/<name>.{json,md} (committed —
// it is the acceptance record) plus full transcripts under the skill's evals/runs/
// (gitignored). Scenario runs are LLM-in-the-loop and NEVER gate pre-commit.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCase } from './lib/cases.mjs';
import { REPO_ROOT, loadConfig } from './lib/skills.mjs';
import { bold, dim, green, red, yellow } from './lib/report.mjs';

// --- checkpoint evaluation ----------------------------------------------------

const matchAll = (text, patterns, flags = '') => (patterns ?? []).filter((p) => !new RegExp(p, flags).test(text));

/**
 * Evaluate one checkpoint. Standard case types (files_exist, contains,
 * not_contains, json_shape, command) run against the SANDBOX; transcript_* types
 * run against the step's transcript; judge asks an LLM to grade against a rubric.
 * @returns {{passed: boolean, message?: string}}
 */
export function evalCheckpoint(checkpoint, { sandbox, transcript, runAgent }) {
  if (checkpoint.type === 'transcript_contains') {
    const missing = matchAll(transcript, checkpoint.patterns);
    return missing.length ? { passed: false, message: `transcript does not match: ${missing.join(' | ')}` } : { passed: true };
  }
  if (checkpoint.type === 'transcript_not_contains') {
    const hits = (checkpoint.patterns ?? []).filter((p) => new RegExp(p).test(transcript));
    return hits.length ? { passed: false, message: `transcript unexpectedly matches: ${hits.join(' | ')}` } : { passed: true };
  }
  if (checkpoint.type === 'transcript_order') {
    let cursor = 0;
    for (const pattern of checkpoint.patterns ?? []) {
      const m = new RegExp(pattern).exec(transcript.slice(cursor));
      if (!m) return { passed: false, message: `expected /${pattern}/ after position ${cursor} — order or presence is wrong` };
      cursor += m.index + m[0].length;
    }
    return { passed: true };
  }
  if (checkpoint.type === 'judge') {
    const files = (checkpoint.files ?? [])
      .map((f) => {
        const abs = path.resolve(sandbox, f);
        return fs.existsSync(abs) ? `--- ${f} ---\n${fs.readFileSync(abs, 'utf8')}` : `--- ${f} --- (MISSING)`;
      })
      .join('\n\n');
    const prompt = [
      'You are a strict evaluator. Grade the output below against the rubric.',
      'Reply with exactly PASS or FAIL on the first line, then a short reason on the following lines.',
      '',
      `Rubric: ${checkpoint.rubric}`,
      '',
      files || `Transcript:\n${transcript.slice(-8000)}`,
    ].join('\n');
    const result = runAgent({ prompt, cwd: sandbox });
    const firstLine = (result.output ?? '').trim().split('\n').find((l) => /\b(PASS|FAIL)\b/.test(l)) ?? '';
    if (/\bPASS\b/.test(firstLine)) return { passed: true, message: result.output.trim() };
    return { passed: false, message: `judge said: ${result.output?.trim().slice(0, 600) || '(no output)'}` };
  }
  return runCase(checkpoint, sandbox);
}

// --- scenario discovery -------------------------------------------------------

/** Scenarios for a use case, found in either half of the pair. */
export function loadScenarios(config, useCase, root = REPO_ROOT) {
  const out = [];
  for (const suffix of Object.values(config.roles.suffixes)) {
    const skillName = `${useCase}${suffix}`;
    const dir = path.join(root, config.productSkillsDir, skillName, config.scenarios.dir);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const defFile = path.join(dir, entry.name, 'scenario.json');
      if (!fs.existsSync(defFile)) continue;
      out.push({ name: entry.name, dir: path.join(dir, entry.name), skillName, def: JSON.parse(fs.readFileSync(defFile, 'utf8')) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// --- the runner ---------------------------------------------------------------

function defaultRunAgent(config) {
  return ({ prompt, cwd }) => {
    const { bin, promptFlag, extraArgs } = config.subagent;
    const result = spawnSync(bin, [...(config.subagent.preArgs ?? []), promptFlag, prompt, ...extraArgs], {
      cwd,
      encoding: 'utf8',
      timeout: 15 * 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { output: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status ?? 1 };
  };
}

function stepPrompt(config, scenario, step, root) {
  const suffix = config.roles.suffixes[step.role ?? 'doer'];
  const skillDir = path.join(root, config.productSkillsDir, `${scenario.def.useCase ?? scenario.useCase}${suffix}`);
  return [
    `Read the skill at ${path.join(skillDir, 'SKILL.md')} and follow it exactly — its references,`,
    'schema, and scripts live in the same directory. Work in the current directory; it contains',
    'the input files and any artifacts produced by earlier steps.',
    '',
    `Task: ${step.prompt}`,
  ].join('\n');
}

/**
 * Run one scenario: `trials` independent sandboxes, each walking every step.
 * @returns the result object that also gets recorded as state.
 */
export function runScenario(config, useCase, scenario, { root = REPO_ROOT, runAgent = defaultRunAgent(config), log = () => {} } = {}) {
  const trials = scenario.def.trials ?? config.scenarios.trials;
  const matrix = [];
  scenario.useCase = useCase;

  for (let trial = 1; trial <= trials; trial++) {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `scenario-${useCase}-`));
    const fixtures = path.join(scenario.dir, scenario.def.fixtures ?? 'fixtures');
    if (fs.existsSync(fixtures)) fs.cpSync(fixtures, sandbox, { recursive: true });

    const results = [];
    const transcripts = [];
    for (const [stepIndex, step] of (scenario.def.steps ?? []).entries()) {
      log(dim(`  trial ${trial}/${trials} · step ${stepIndex + 1} (${step.role ?? 'doer'})`));
      const run = runAgent({ prompt: stepPrompt(config, scenario, step, root), cwd: sandbox });
      transcripts.push({ step: stepIndex + 1, role: step.role ?? 'doer', output: run.output });
      for (const checkpoint of step.checkpoints ?? []) {
        const outcome = evalCheckpoint(checkpoint, { sandbox, transcript: run.output, runAgent });
        results.push({ step: stepIndex + 1, id: checkpoint.id, passed: outcome.passed, message: outcome.passed ? undefined : outcome.message });
      }
    }

    // Keep the full transcripts next to the skill (gitignored).
    const runsDir = path.join(root, config.productSkillsDir, scenario.skillName, config.evals.runsDir);
    fs.mkdirSync(runsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(runsDir, `${stamp}-${scenario.name}-trial${trial}.md`);
    fs.writeFileSync(
      logFile,
      `# Scenario ${scenario.name} — trial ${trial}\n\n` +
        transcripts.map((t) => `## Step ${t.step} (${t.role})\n\n\`\`\`\n${t.output}\n\`\`\`\n`).join('\n'),
    );

    matrix.push({ trial, transcript: path.relative(root, logFile), checkpoints: results });
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  // Every distinct checkpoint gets a short ID (C1, C2, ...) so a human can refer
  // to a row without typing anything out: "waive C3 because ...".
  const keys = [...new Map(matrix[0]?.checkpoints.map((c) => [`${c.step}:${c.id}`, true]) ?? []).keys()];
  const cids = Object.fromEntries(keys.map((key, i) => [`C${i + 1}`, key]));

  const allCheckpoints = matrix.flatMap((t) => t.checkpoints);
  const verdict = allCheckpoints.length > 0 && allCheckpoints.every((c) => c.passed) ? 'pass' : 'fail';
  return {
    useCase,
    scenario: scenario.name,
    skill: scenario.skillName,
    ranAt: new Date().toISOString(),
    trials,
    threshold: `${trials}/${trials}`,
    verdict,
    override: null,
    waivers: [],
    cids,
    matrix,
  };
}

// --- state + the human-facing report ------------------------------------------

const stateBase = (config, useCase, name, root) => path.join(root, config.scenarios.stateDir, useCase, name);

export function writeScenarioState(config, result, root = REPO_ROOT) {
  const base = stateBase(config, result.useCase, result.scenario, root);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.json`, JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(`${base}.md`, renderReport(result));
  return base;
}

export function readScenarioState(config, useCase, name, root = REPO_ROOT) {
  const file = `${stateBase(config, useCase, name, root)}.json`;
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** Resolve a human-friendly reference (C3, or the full "step:id" key) to a checkpoint key. */
export function resolveCheckpoint(result, ref) {
  if (result.cids?.[ref]) return result.cids[ref];
  const keys = Object.values(result.cids ?? {});
  if (keys.includes(ref)) return ref;
  throw new Error(`no checkpoint "${ref}" — the report lists them as ${Object.keys(result.cids ?? {}).join(', ')}`);
}

const isWaived = (result, key) => (result.waivers ?? []).some((w) => w.checkpoint === key);

/**
 * The effective verdict, in precedence order: a whole-verdict human override wins;
 * otherwise a failed run counts as pass when every failing checkpoint is waived.
 */
export function effectiveVerdict(result) {
  if (result.override) return result.override.verdict;
  if (result.verdict === 'pass') return 'pass';
  const failingKeys = [
    ...new Set(result.matrix.flatMap((t) => t.checkpoints.filter((c) => !c.passed).map((c) => `${c.step}:${c.id}`))),
  ];
  return failingKeys.length > 0 && failingKeys.every((key) => isWaived(result, key)) ? 'pass' : result.verdict;
}

/** Whole-verdict override: accept or reject the scenario despite the machine. */
export function applyOverride(config, useCase, name, { verdict, reason, by }, root = REPO_ROOT) {
  const result = readScenarioState(config, useCase, name, root);
  if (!result) throw new Error(`no recorded run for scenario "${name}" — run it first`);
  if (!reason) throw new Error('an override needs a reason — it is on the record');
  result.override = { verdict, reason, by, at: new Date().toISOString() };
  writeScenarioState(config, result, root);
  return result;
}

/** Waive ONE checkpoint by ID: that failure is accepted; everything else still counts. */
export function applyWaiver(config, useCase, name, { checkpoint, reason, by }, root = REPO_ROOT) {
  const result = readScenarioState(config, useCase, name, root);
  if (!result) throw new Error(`no recorded run for scenario "${name}" — run it first`);
  if (!reason) throw new Error('a waiver needs a reason — it is on the record');
  const key = resolveCheckpoint(result, checkpoint);
  result.waivers = (result.waivers ?? []).filter((w) => w.checkpoint !== key);
  result.waivers.push({ checkpoint: key, reason, by, at: new Date().toISOString() });
  writeScenarioState(config, result, root);
  return result;
}

/** One report per scenario: verdict on top, checkpoint × trial grid as evidence. */
export function renderReport(result) {
  const lines = [];
  const effective = effectiveVerdict(result);
  const waivers = result.waivers ?? [];
  const waivedNote = !result.override && result.verdict === 'fail' && effective === 'pass' ? ' (failures waived by the human — details below)' : '';
  lines.push(`# Scenario: ${result.scenario} (${result.useCase})`);
  lines.push('');
  lines.push(`**Verdict: ${effective.toUpperCase()}**` + (result.override ? ` (human override — machine said ${result.verdict.toUpperCase()})` : ` (machine, threshold ${result.threshold})${waivedNote}`));
  if (result.override) lines.push(`> Overridden by ${result.override.by} at ${result.override.at}: ${result.override.reason}`);
  lines.push('');
  lines.push(`Ran ${result.ranAt} — ${result.trials} independent trials, every checkpoint must pass in every trial.`);
  lines.push('');

  // checkpoint × trial grid, with a rate column: the diagnosis view.
  const cids = result.cids ?? {};
  const keyToCid = Object.fromEntries(Object.entries(cids).map(([cid, key]) => [key, cid]));
  lines.push(`| ID | Checkpoint | ${result.matrix.map((t) => `trial ${t.trial}`).join(' | ')} | rate |`);
  lines.push(`| --- | --- | ${result.matrix.map(() => '---').join(' | ')} | --- |`);
  for (const [cid, key] of Object.entries(cids)) {
    const cells = result.matrix.map((t) => (t.checkpoints.find((c) => `${c.step}:${c.id}` === key)?.passed ? 'pass' : '**FAIL**'));
    const passes = cells.filter((c) => c === 'pass').length;
    const waived = waivers.find((w) => w.checkpoint === key);
    lines.push(`| ${cid} | ${key}${waived ? ' *(waived)*' : ''} | ${cells.join(' | ')} | ${passes}/${result.trials} |`);
  }
  lines.push('');

  const failures = result.matrix.flatMap((t) => t.checkpoints.filter((c) => !c.passed).map((c) => ({ trial: t.trial, ...c })));
  if (failures.length) {
    lines.push('## Failures');
    lines.push('');
    for (const f of failures) {
      const cid = keyToCid[`${f.step}:${f.id}`] ?? `${f.step}:${f.id}`;
      lines.push(`- ${cid} (trial ${f.trial}) — ${f.message}`);
    }
    lines.push('');
  }
  if (waivers.length) {
    lines.push('## Waived by the human');
    lines.push('');
    for (const w of waivers) {
      lines.push(`- ${keyToCid[w.checkpoint] ?? w.checkpoint} — by ${w.by} at ${w.at}: ${w.reason}`);
    }
    lines.push('');
  }

  lines.push('## Transcripts');
  lines.push('');
  for (const t of result.matrix) lines.push(`- trial ${t.trial}: \`${t.transcript}\``);
  lines.push('');
  lines.push('Disagree? Tell your assistant, using the IDs above — no need to describe anything:');
  lines.push(`- "Waive ${Object.keys(cids)[0] ?? 'C1'} because ..." — accept that one failing check; the rest still counts.`);
  lines.push('- "Accept this whole result because ..." / "Reject it because ..." — overrule the verdict.');
  lines.push('');
  lines.push('Every decision is recorded here with your name and reason. (Command form: docs/advanced.md.)');
  lines.push('');
  return lines.join('\n');
}

// --- CLI ----------------------------------------------------------------------

function main(argv) {
  const config = loadConfig();
  const accept = argv.indexOf('--accept');
  const reject = argv.indexOf('--reject');
  const waive = argv.indexOf('--waive');
  const list = argv.includes('--list');
  const consumed = new Set([accept + 1, reject + 1, waive + 1, waive === -1 ? -9 : waive + 2].filter((i) => i > 0));
  const positional = argv.filter((a, i) => !a.startsWith('--') && !consumed.has(i));
  const [useCase, only] = positional;

  if (!useCase) {
    console.log('usage: npm run scenario -- <use-case> [scenario-name] [--list]');
    console.log('       npm run scenario -- <use-case> <name> --accept "reason" | --reject "reason"');
    console.log('       npm run scenario -- <use-case> <name> --waive <checkpoint-id> "reason"');
    return 1;
  }

  if (list) {
    const scenarios = loadScenarios(config, useCase);
    if (scenarios.length === 0) {
      console.log(`no scenarios for "${useCase}"`);
      return 0;
    }
    for (const s of scenarios) {
      const recorded = readScenarioState(config, useCase, s.name);
      if (!recorded) {
        console.log(`${yellow('never run')} ${s.name} ${dim(s.def.description ?? '')}`);
        continue;
      }
      const effective = effectiveVerdict(recorded);
      const failing = Object.entries(recorded.cids ?? {})
        .filter(([, key]) => recorded.matrix.some((t) => t.checkpoints.some((c) => `${c.step}:${c.id}` === key && !c.passed)))
        .map(([cid]) => cid);
      console.log(`${effective === 'pass' ? green('PASS') : red('FAIL')} ${s.name} ${dim(`(machine: ${recorded.verdict}${failing.length ? `, failing: ${failing.join(', ')}` : ''})`)}`);
    }
    return 0;
  }

  if (accept !== -1 || reject !== -1 || waive !== -1) {
    if (!only) {
      console.error(red('a decision targets one scenario: npm run scenario -- <use-case> <name> --accept "reason"'));
      return 1;
    }
    const by = process.env.USER || process.env.USERNAME || 'unknown';
    try {
      const result =
        waive !== -1
          ? applyWaiver(config, useCase, only, { checkpoint: argv[waive + 1], reason: argv[waive + 2], by })
          : applyOverride(config, useCase, only, { verdict: accept !== -1 ? 'pass' : 'fail', reason: argv[(accept !== -1 ? accept : reject) + 1], by });
      console.log(green(`Recorded: ${only} is now ${effectiveVerdict(result).toUpperCase()} (${waive !== -1 ? `waiver on ${argv[waive + 1]}` : 'override'} by ${by}).`));
      console.log(dim(`Commit the updated ${config.scenarios.stateDir}/${useCase}/${only}.{json,md} with your decision.`));
      return 0;
    } catch (err) {
      console.error(red(err.message));
      return 1;
    }
  }

  const scenarios = loadScenarios(config, useCase).filter((s) => !only || s.name === only);
  if (scenarios.length === 0) {
    console.error(red(`no scenarios${only ? ` named "${only}"` : ''} for "${useCase}" — add ${config.scenarios.dir}/<name>/scenario.json inside the skill`));
    return 1;
  }

  const { bin } = config.subagent;
  if (spawnSync(bin, ['--version'], { stdio: 'ignore' }).error) {
    console.error(red(`the "${bin}" CLI is not installed — scenarios need the clean sub-agent.`));
    return 1;
  }

  let failed = 0;
  for (const scenario of scenarios) {
    console.log(bold(`Scenario ${scenario.name} — ${scenario.def.description ?? ''}`));
    const result = runScenario(config, useCase, scenario, { log: console.log });
    writeScenarioState(config, result);
    const effective = effectiveVerdict(result);
    console.log(effective === 'pass' ? green(`PASS ${scenario.name}`) : red(`FAIL ${scenario.name}`));
    console.log(dim(`report: ${config.scenarios.stateDir}/${useCase}/${scenario.name}.md`));
    if (effective !== 'pass') failed += 1;
  }
  if (failed) console.log(yellow(`\n${failed} scenario(s) failing. Read the report grid: the rate column names the weak checkpoint.`));
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
