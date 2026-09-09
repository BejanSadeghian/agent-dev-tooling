#!/usr/bin/env node
// Interactive use-case generator. Asks the questions, then writes the whole PAIR:
//   skills/<use-case>-doer/         SKILL.md, references/schema.md, variations,
//                                        deterministic scripts/, three kinds of test,
//                                        seed regression cases
//   skills/<use-case>-observer/  SKILL.md (Facts/Interpretations contract),
//                                        variations, structural regression cases
// Then validates and runs both.
//
//   npm run skill:new
//   npm run skill:new -- --answers answers.json --yes      # non-interactive
//   npm run skill:new -- --only doer|observer           # scaffold one missing half
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Prompter } from './lib/prompt.mjs';
import * as T from './lib/templates.mjs';
import { REPO_ROOT, loadConfig } from './lib/skills.mjs';
import { bold, dim, green, red } from './lib/report.mjs';

/** "unit_price: number — price per unit in USD" */
export function parseFieldLine(line) {
  const [head, ...restParts] = line.split(/\s+[—-]\s+/);
  const notes = restParts.join(' - ').trim();
  const [rawName, rawType] = head.split(':').map((s) => s?.trim());
  if (!rawName) return null;
  return {
    name: rawName.replace(/[^a-zA-Z0-9_]/g, '_'),
    type: rawType || 'string',
    notes: notes || 'WHAT IT MEANS',
  };
}

function parseArgs(argv) {
  const args = { only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--answers') args.answersFile = argv[++i];
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--no-verify') args.noVerify = true;
    else if (!a.startsWith('-')) args.useCase = a;
  }
  return args;
}

async function collect(prompter, args) {
  const kebab = (v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);

  const useCase = await prompter.ask('useCase', 'What is the use case called? (lower-case-with-dashes)', {
    default: args.useCase ?? '',
    hint: 'Becomes the pair: <use-case>-doer and <use-case>-observer. Say what it does: "sales-summary", not "helper".',
    validate: (v) => (kebab(v) ? null : 'lower case letters, numbers and dashes only'),
  });

  const what = await prompter.ask('what', 'In one sentence, what does the DOER do?', {
    hint: 'Third person, procedural: "Aggregates transaction rows into a per-category summary table."',
    default: `Processes ${useCase.replace(/-/g, ' ')} input data into the structured ${useCase} artifact.`,
    validate: (v) => (v.length >= 20 ? null : 'a little more detail — this becomes the trigger description'),
  });

  const trigger = await prompter.ask('trigger', 'When should the doer fire? Finish: "Use when ..."', {
    hint: 'The words someone would actually type when they need the data processed.',
    default: `Use when someone has raw ${useCase.replace(/-/g, ' ')} data that needs processing into the structured artifact.`,
    validate: (v) => (v.toLowerCase().startsWith('use when') ? null : 'start with "Use when"'),
  });

  const nonTrigger = await prompter.ask('nonTrigger', 'When must the doer NOT fire?', {
    hint: 'The near-miss request that should go somewhere else.',
    default: 'requests that only look similar but need a different skill',
  });

  const fieldLines = await prompter.list('fields', 'What fields does each artifact record carry?', {
    hint: 'One per line: "unit_price: number — price per unit in USD". Blank line to finish.',
  });
  const fields = fieldLines.map(parseFieldLine).filter(Boolean);

  const steps = await prompter.list('steps', 'What are the doer steps, in order?', {
    hint: 'One per line, imperative: "Check the input columns". Blank line to finish. Leave empty for a sensible default.',
  });

  // One deterministic module per step when the author named more than one.
  let modules = [];
  if (steps.length > 1) {
    const slug = (text, i) => {
      const word = (text.split(/\s+/)[0] || `step${i + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, '');
      return /^[a-z_]/.test(word) ? word : `step_${word}`;
    };
    const raw = await prompter.ask('moduleNames', 'Short code name for each step, in the same order (comma-separated)?', {
      hint: 'One word each, e.g. "parse, reconcile, rank". Each becomes scripts/<name>.py with a single run() function.',
      default: steps.map(slug).join(', '),
    });
    const seen = new Set();
    modules = steps.map((step, i) => {
      let name = String(raw).split(',')[i]?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || slug(step, i);
      if (!/^[a-z_]/.test(name)) name = `step_${name}`;
      let unique = name, n = 2;
      while (seen.has(unique)) unique = `${name}_${n++}`;
      seen.add(unique);
      return { name: unique, step };
    });
  }

  const interprets = await prompter.ask('interprets', 'In one sentence, what does the INTERPRETER read out of the artifact?', {
    hint: 'Third person: "Reads the sales summary and assesses category health and momentum."',
    default: `Reads the ${useCase} artifact, states the facts it shows, and interprets them.`,
    validate: (v) => (v.length >= 20 ? null : 'a little more detail — this becomes the trigger description'),
  });

  const observerTrigger = await prompter.ask('observerTrigger', 'When should the observer fire? Finish: "Use when ..."', {
    default: `Use when someone wants the ${useCase} artifact explained, assessed, or turned into a recommendation.`,
    validate: (v) => (v.toLowerCase().startsWith('use when') ? null : 'start with "Use when"'),
  });

  const observerNonTrigger = await prompter.ask('observerNonTrigger', 'When must the observer NOT fire?', {
    default: 'producing or reprocessing the data itself',
  });

  const lens = await prompter.ask('lens', 'What lens does the observer apply to the facts?', {
    hint: 'The judgment rules: what counts as good/bad/urgent, thresholds in words, what a reader should do with it.',
    default: 'Apply the judgment rules this skill documents: what counts as notable, concerning, or actionable in these facts.',
  });

  return { useCase, what, trigger, nonTrigger, fields, steps, modules, interprets, observerTrigger, observerNonTrigger, lens };
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

/** Two sample rows built from the interview fields, for the artifact seed test. */
function sampleValue(type, i) {
  const t = (type || 'string').toLowerCase();
  if (/(^|_)int/.test(t) || t === 'integer') return i + 1;
  if (/float|number|decimal|double/.test(t)) return (i + 1) * 1.5;
  if (/bool/.test(t)) return i % 2 === 0;
  return `sample-${i + 1}`;
}

function seedInputFor(fields) {
  return [0, 1].map((i) => Object.fromEntries((fields || []).map((f) => [f.name, sampleValue(f.type, i)])));
}

/** Run the doer entry on the seed input and return the produced artifact. */
function runEntry(scriptsDir, module, fnName, input) {
  const code = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
    `from ${module} import ${fnName}`,
    'payload = json.load(sys.stdin)',
    `result = ${fnName}(payload)`,
    'print(json.dumps(result, sort_keys=True, default=str))',
  ].join('\n');
  const out = execFileSync('python3', ['-c', code], { input: JSON.stringify(input), encoding: 'utf8' });
  return JSON.parse(out);
}

async function main(argv) {
  const args = parseArgs(argv);
  const config = loadConfig();
  const answers = args.answersFile ? JSON.parse(fs.readFileSync(args.answersFile, 'utf8')) : {};
  const prompter = new Prompter({ answers, assumeYes: args.yes });

  console.log(bold('\nNew use case — a doer/observer pair\n'));
  console.log(dim('Answer as much as you can. Everything gets generated: both skills, the schema, the code, and all three kinds of test.\n'));

  const spec = await collect(prompter, args);
  prompter.close();

  if (!spec.useCase) {
    console.error(red('\nNo use-case name. A non-interactive run must supply the answers:'));
    console.error('  npm run skill:new -- <use-case-name>                       # name only, defaults for the rest');
    console.error('  npm run skill:new -- --answers answers.json --yes          # full control');
    console.error(dim('  answers.json keys: useCase, what, trigger, nonTrigger, fields[], steps[],'));
    console.error(dim('                     interprets, observerTrigger, observerNonTrigger, lens, moduleNames'));
    return 1;
  }

  const baseDir = args.root ? path.resolve(args.root) : path.resolve(REPO_ROOT, config.productSkillsDir);
  const doerDir = path.join(baseDir, `${spec.useCase}${config.roles.suffixes.doer}`);
  const observerDir = path.join(baseDir, `${spec.useCase}${config.roles.suffixes.observer}`);
  const wantDoer = args.only !== 'observer';
  const wantObserver = args.only !== 'doer';

  for (const [want, dir] of [[wantDoer, doerDir], [wantObserver, observerDir]]) {
    if (want && fs.existsSync(dir)) {
      console.error(red(`\n${path.relative(REPO_ROOT, dir)} already exists. Pick another name, edit the existing skill, or use --only for the missing half.`));
      return 1;
    }
  }

  const steps = spec.steps.length ? spec.steps : ['Check the input is what the skill expects', 'Run the deterministic code on it', 'Report what was produced'];
  const written = [];
  const generated = [];

  if (wantDoer) {
    generated.push(`${spec.useCase}${config.roles.suffixes.doer}`);
    written.push(write(path.join(doerDir, 'SKILL.md'), T.doerSkillMd({ ...spec, steps })));
    written.push(write(path.join(doerDir, config.roles.doer.schemaFile), T.schemaMd(spec)));
    written.push(write(path.join(doerDir, 'references/variations/default.md'), T.variationMd({ name: `${spec.useCase}-doer`, useCase: spec.useCase })));
    written.push(write(path.join(doerDir, 'assets/source/interview.md'), T.interviewScript({ name: spec.useCase, questions: prompter.transcript.map((t) => t.question) })));
    written.push(write(path.join(doerDir, 'assets/source/interview-notes.md'), T.interviewNotes({ name: spec.useCase, answers: prompter.transcript })));
    const entryModule = T.moduleNameFor(spec.useCase);
    const entryFn = T.functionNameFor(spec.useCase);
    const testTargets = [{ module: entryModule, fn: entryFn, isEntry: true }];
    if (spec.modules.length) {
      for (const m of spec.modules) {
        written.push(write(path.join(doerDir, config.python.dir, `${m.name}.py`), T.stepModule({ useCase: spec.useCase, name: m.name, step: m.step })));
        testTargets.push({ module: m.name, fn: 'run', isEntry: false });
      }
      written.push(write(path.join(doerDir, config.python.dir, `${entryModule}.py`), T.orchestratorModule({ useCase: spec.useCase, modules: spec.modules })));
    } else {
      written.push(write(path.join(doerDir, config.python.dir, `${entryModule}.py`), T.pythonModule(spec)));
    }
    for (const target of testTargets) {
      for (const kind of config.coverage.kinds) {
        written.push(write(path.join(doerDir, config.python.testsDir, `test_${kind}_${target.module}.py`), T.pythonTest({ kind, useCase: spec.useCase, module: target.module, fn: target.fn, isEntry: target.isEntry })));
      }
    }
    for (const seed of T.doerSeedTests(spec)) {
      written.push(write(path.join(doerDir, config.evals.dir, seed.file), seed.text));
    }
    // Seed artifact test with a real expected value, computed by running the entry.
    try {
      const seedInput = seedInputFor(spec.fields);
      const expected = runEntry(path.join(doerDir, config.python.dir), entryModule, entryFn, seedInput);
      const seed = T.artifactSeedTest({
        useCase: spec.useCase,
        entry: `${config.python.dir}/${entryModule}.py:${entryFn}`,
        input: seedInput,
        expected,
      });
      written.push(write(path.join(doerDir, config.evals.dir, seed.file), seed.text));
    } catch (err) {
      console.log(dim(`  (skipped the artifact seed test: ${err.message})`));
    }
  }

  if (wantObserver) {
    generated.push(`${spec.useCase}${config.roles.suffixes.observer}`);
    written.push(write(path.join(observerDir, 'SKILL.md'), T.observerSkillMd({ ...spec, whatItInterprets: spec.interprets, trigger: spec.observerTrigger, nonTrigger: spec.observerNonTrigger })));
    written.push(write(path.join(observerDir, 'references/variations/default.md'), T.variationMd({ name: `${spec.useCase}-observer`, useCase: spec.useCase })));
    for (const seed of T.observerSeedTests(spec)) {
      written.push(write(path.join(observerDir, config.evals.dir, seed.file), seed.text));
    }
  }

  console.log(green(`\nGenerated ${written.length} files across ${generated.length} skill(s): ${generated.join(', ')}`));
  for (const file of written) console.log(dim(`  ${path.relative(REPO_ROOT, file)}`));

  if (!args.noVerify) {
    console.log(bold('\nChecking what was generated...\n'));
    const run = (cmd, cmdArgs) => {
      try {
        console.log(execFileSync(cmd, cmdArgs, { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }));
        return true;
      } catch (err) {
        console.log(`${err.stdout ?? ''}${err.stderr ?? ''}`);
        return false;
      }
    };
    run('node', ['.framework/scripts/validate-skill.mjs', ...generated]);
    run('node', ['.framework/scripts/run-regression.mjs', ...generated]);
  }

  console.log(bold('\nNext'));
  console.log('  1. Replace the scaffolded parts: the real schema fields, the real deterministic logic, the real lens.');
  console.log('  2. Make the generated test files assert the real behaviour, not the scaffold\'s.');
  console.log(`  3. Test it with a clean sub-agent: npm run subagent -- ${spec.useCase} "a realistic task"`);
  console.log(`  4. npm run check    ${dim('(then: npm run publish -- <use-case>)')}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
