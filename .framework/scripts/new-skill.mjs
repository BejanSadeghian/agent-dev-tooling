#!/usr/bin/env node
// Interactive use-case generator. Asks the questions, then writes the whole PAIR:
//   skills/<use-case>-doer/         SKILL.md, references/schema.md, variations,
//                                        deterministic scripts/, three kinds of test,
//                                        seed regression cases
//   skills/<use-case>-interpreter/  SKILL.md (Facts/Interpretations contract),
//                                        variations, structural regression cases
// Then validates and runs both.
//
//   npm run skill:new
//   npm run skill:new -- --answers answers.json --yes      # non-interactive
//   npm run skill:new -- --only doer|interpreter           # scaffold one missing half
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
    hint: 'Becomes the pair: <use-case>-doer and <use-case>-interpreter. Say what it does: "sales-summary", not "helper".',
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

  const interprets = await prompter.ask('interprets', 'In one sentence, what does the INTERPRETER read out of the artifact?', {
    hint: 'Third person: "Reads the sales summary and assesses category health and momentum."',
    default: `Reads the ${useCase} artifact, states the facts it shows, and interprets them.`,
    validate: (v) => (v.length >= 20 ? null : 'a little more detail — this becomes the trigger description'),
  });

  const interpreterTrigger = await prompter.ask('interpreterTrigger', 'When should the interpreter fire? Finish: "Use when ..."', {
    default: `Use when someone wants the ${useCase} artifact explained, assessed, or turned into a recommendation.`,
    validate: (v) => (v.toLowerCase().startsWith('use when') ? null : 'start with "Use when"'),
  });

  const interpreterNonTrigger = await prompter.ask('interpreterNonTrigger', 'When must the interpreter NOT fire?', {
    default: 'producing or reprocessing the data itself',
  });

  const lens = await prompter.ask('lens', 'What lens does the interpreter apply to the facts?', {
    hint: 'The judgment rules: what counts as good/bad/urgent, thresholds in words, what a reader should do with it.',
    default: 'Apply the judgment rules this skill documents: what counts as notable, concerning, or actionable in these facts.',
  });

  return { useCase, what, trigger, nonTrigger, fields, steps, interprets, interpreterTrigger, interpreterNonTrigger, lens };
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

async function main(argv) {
  const args = parseArgs(argv);
  const config = loadConfig();
  const answers = args.answersFile ? JSON.parse(fs.readFileSync(args.answersFile, 'utf8')) : {};
  const prompter = new Prompter({ answers, assumeYes: args.yes });

  console.log(bold('\nNew use case — a doer/interpreter pair\n'));
  console.log(dim('Answer as much as you can. Everything gets generated: both skills, the schema, the code, and all three kinds of test.\n'));

  const spec = await collect(prompter, args);
  prompter.close();

  const baseDir = args.root ? path.resolve(args.root) : path.resolve(REPO_ROOT, config.productSkillsDir);
  const doerDir = path.join(baseDir, `${spec.useCase}${config.roles.suffixes.doer}`);
  const interpreterDir = path.join(baseDir, `${spec.useCase}${config.roles.suffixes.interpreter}`);
  const wantDoer = args.only !== 'interpreter';
  const wantInterpreter = args.only !== 'doer';

  for (const [want, dir] of [[wantDoer, doerDir], [wantInterpreter, interpreterDir]]) {
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
    written.push(write(path.join(doerDir, 'references/interview-notes.md'), T.interviewNotes({ name: spec.useCase, answers: prompter.transcript })));
    written.push(write(path.join(doerDir, config.python.dir, `${T.moduleNameFor(spec.useCase)}.py`), T.pythonModule(spec)));
    for (const kind of config.coverage.kinds) {
      written.push(write(path.join(doerDir, config.python.testsDir, `test_${kind}_${T.moduleNameFor(spec.useCase)}.py`), T.pythonTest({ kind, useCase: spec.useCase })));
    }
    for (const seed of T.doerSeedCases(spec)) {
      written.push(write(path.join(doerDir, config.evals.dir, seed.file), seed.text));
    }
  }

  if (wantInterpreter) {
    generated.push(`${spec.useCase}${config.roles.suffixes.interpreter}`);
    written.push(write(path.join(interpreterDir, 'SKILL.md'), T.interpreterSkillMd({ ...spec, whatItInterprets: spec.interprets, trigger: spec.interpreterTrigger, nonTrigger: spec.interpreterNonTrigger })));
    written.push(write(path.join(interpreterDir, 'references/variations/default.md'), T.variationMd({ name: `${spec.useCase}-interpreter`, useCase: spec.useCase })));
    for (const seed of T.interpreterSeedCases(spec)) {
      written.push(write(path.join(interpreterDir, config.evals.dir, seed.file), seed.text));
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
  console.log('  2. Make the three doer test files assert the real behaviour, not the scaffold\'s.');
  console.log(`  3. Test it with a clean sub-agent: npm run subagent -- ${spec.useCase} "a realistic task"`);
  console.log(`  4. npm run check    ${dim('(then: npm run save)')}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
