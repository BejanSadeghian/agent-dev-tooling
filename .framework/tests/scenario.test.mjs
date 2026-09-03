// Scenario evals test the agent USING the skill: fresh sandbox per trial,
// multi-step runs where later steps see earlier artifacts, checkpoints over
// artifacts and transcripts, repeatability, and the human override.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  applyOverride,
  effectiveVerdict,
  evalCheckpoint,
  loadScenarios,
  readScenarioState,
  renderReport,
  runScenario,
  writeScenarioState,
} from '../scripts/scenario.mjs';
import { loadConfig } from '../scripts/lib/skills.mjs';
import { VALID_SCHEMA_MD, doerSkillMd, makeRepo } from './helpers.mjs';

function makeScenarioRepo({ steps, trials = 2 } = {}) {
  const repo = makeRepo({
    name: 'margin-doer',
    skillsRoot: 'skills',
    skillMd: doerSkillMd('margin-doer'),
    schemaMd: VALID_SCHEMA_MD,
    scripts: { 'margin.py': 'x = 1\n' },
  });
  const scenarioDir = path.join(repo.skillDir, 'evals/scenarios/first-run');
  fs.mkdirSync(path.join(scenarioDir, 'fixtures'), { recursive: true });
  fs.writeFileSync(path.join(scenarioDir, 'fixtures/input.csv'), 'id,value\n1,10\n');
  fs.writeFileSync(
    path.join(scenarioDir, 'scenario.json'),
    JSON.stringify({ description: 'process the sample export', trials, steps }, null, 2),
  );
  return repo;
}

const DOER_STEP = {
  role: 'doer',
  prompt: 'Process input.csv into the artifact.',
  checkpoints: [
    { id: 'artifact-exists', type: 'files_exist', paths: ['outputs/margin.json'] },
    { id: 'conforms', type: 'json_shape', file: 'outputs/margin.json', requiredKeys: ['records', 'deviations'] },
    { id: 'ran-the-script', type: 'transcript_contains', patterns: ['python3'] },
  ],
};

/** A fake sub-agent that behaves like a good doer run. */
const goodDoerAgent = ({ cwd }) => {
  fs.mkdirSync(path.join(cwd, 'outputs'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'outputs/margin.json'), JSON.stringify({ records: [{ id: 1 }], deviations: [] }));
  return { output: 'I ran: python3 scripts/margin.py over input.csv and wrote the artifact.', status: 0 };
};

test('transcript checkpoints match content and order; judge parses PASS/FAIL', () => {
  const ctx = { sandbox: '/tmp', transcript: 'read schema.md then ran python3 then wrote outputs' };
  assert.equal(evalCheckpoint({ type: 'transcript_contains', patterns: ['python3'] }, ctx).passed, true);
  assert.equal(evalCheckpoint({ type: 'transcript_not_contains', patterns: ['guessed'] }, ctx).passed, true);
  assert.equal(evalCheckpoint({ type: 'transcript_order', patterns: ['schema\\.md', 'python3', 'outputs'] }, ctx).passed, true);
  assert.equal(evalCheckpoint({ type: 'transcript_order', patterns: ['python3', 'schema\\.md'] }, ctx).passed, false);

  const pass = evalCheckpoint({ type: 'judge', rubric: 'is it good?' }, { ...ctx, runAgent: () => ({ output: 'PASS\nfaithful to facts' }) });
  assert.equal(pass.passed, true);
  const fail = evalCheckpoint({ type: 'judge', rubric: 'is it good?' }, { ...ctx, runAgent: () => ({ output: 'FAIL\nmixed opinion into facts' }) });
  assert.equal(fail.passed, false);
  assert.match(fail.message, /mixed opinion/);
});

test('a scenario runs its trials in fresh sandboxes and passes when every checkpoint passes', (t) => {
  const repo = makeScenarioRepo({ steps: [DOER_STEP] });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const [scenario] = loadScenarios(config, 'margin', repo.root);
  assert.equal(scenario.name, 'first-run');

  const result = runScenario(config, 'margin', scenario, { root: repo.root, runAgent: goodDoerAgent });
  assert.equal(result.verdict, 'pass');
  assert.equal(result.matrix.length, 2);
  assert.equal(result.matrix[0].checkpoints.length, 3);

  writeScenarioState(config, result, repo.root);
  const recorded = readScenarioState(config, 'margin', 'first-run', repo.root);
  assert.equal(recorded.verdict, 'pass');
  const report = renderReport(recorded);
  assert.match(report, /\*\*Verdict: PASS\*\*/);
  assert.match(report, /1:artifact-exists \| pass \| pass \| 2\/2/);
});

test('one flaky trial fails the strict verdict, and the grid names the weak checkpoint', (t) => {
  const repo = makeScenarioRepo({ steps: [DOER_STEP] });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const [scenario] = loadScenarios(config, 'margin', repo.root);

  let calls = 0;
  const flaky = (args) => {
    calls += 1;
    if (calls === 1) return goodDoerAgent(args);
    return { output: 'I computed the totals myself instead of running the script.', status: 0 };
  };
  const result = runScenario(config, 'margin', scenario, { root: repo.root, runAgent: flaky });
  assert.equal(result.verdict, 'fail');
  const report = renderReport(result);
  assert.match(report, /1:ran-the-script \| pass \| \*\*FAIL\*\* \| 1\/2/);
  assert.match(report, /## Failures/);
});

test('later steps see what earlier steps produced', (t) => {
  const steps = [
    DOER_STEP,
    {
      role: 'doer', // same skill for the test; the sandbox continuity is what is under test
      prompt: 'Now interpret the artifact.',
      checkpoints: [
        { id: 'read-the-artifact', type: 'transcript_contains', patterns: ['records=1'] },
        { id: 'reading-written', type: 'files_exist', paths: ['outputs/reading.md'] },
      ],
    },
  ];
  const repo = makeScenarioRepo({ steps, trials: 1 });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const [scenario] = loadScenarios(config, 'margin', repo.root);

  const agent = ({ prompt, cwd }) => {
    if (prompt.includes('interpret')) {
      const artifact = JSON.parse(fs.readFileSync(path.join(cwd, 'outputs/margin.json'), 'utf8'));
      fs.writeFileSync(path.join(cwd, 'outputs/reading.md'), '## Facts\n\n## Interpretations\n');
      return { output: `read the artifact: records=${artifact.records.length}`, status: 0 };
    }
    return goodDoerAgent({ cwd });
  };
  const result = runScenario(config, 'margin', scenario, { root: repo.root, runAgent: agent });
  assert.equal(result.verdict, 'pass');
});

test('a human override flips the effective verdict, on the record, and needs a reason', (t) => {
  const repo = makeScenarioRepo({ steps: [DOER_STEP], trials: 1 });
  t.after(repo.cleanup);
  const config = loadConfig(repo.root);
  const [scenario] = loadScenarios(config, 'margin', repo.root);
  const result = runScenario(config, 'margin', scenario, {
    root: repo.root,
    runAgent: () => ({ output: 'did nothing useful', status: 0 }),
  });
  writeScenarioState(config, result, repo.root);
  assert.equal(result.verdict, 'fail');

  assert.throws(() => applyOverride(config, 'margin', 'first-run', { verdict: 'pass', by: 'tester' }, repo.root), /needs a reason/);

  const overridden = applyOverride(
    config,
    'margin',
    'first-run',
    { verdict: 'pass', reason: 'checkpoint was too strict; output was actually fine', by: 'tester' },
    repo.root,
  );
  assert.equal(effectiveVerdict(overridden), 'pass');
  assert.equal(overridden.verdict, 'fail'); // the machine's verdict stays on the record
  const report = renderReport(overridden);
  assert.match(report, /human override — machine said FAIL/);
  assert.match(report, /too strict/);
});
