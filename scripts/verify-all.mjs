#!/usr/bin/env node
// One command that runs every check, in the order that gives the most useful
// first failure: format → tests (records the result) → rubric → library health.
//
//   npm run check            everything
//   npm run check -- <skill> just that skill (health still looks at the whole library)
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './lib/skills.mjs';
import { bold, dim, green, red } from './lib/report.mjs';

const STAGES = [
  { name: 'lint', script: 'scripts/lint.mjs', perSkill: false, why: 'syntax and house rules across the repo' },
  { name: 'format', script: 'scripts/validate-skill.mjs', perSkill: true, why: 'every skill matches the format spec' },
  { name: 'tests', script: 'scripts/run-regression.mjs', perSkill: true, why: 'every regression case, Python test and performance budget passes' },
  { name: 'rubric', script: 'scripts/check-rubric.mjs', perSkill: true, why: 'nothing is untested, stale, or missing coverage' },
  { name: 'health', script: 'scripts/health.mjs', perSkill: false, why: 'the library as a whole is not drifting' },
];

function main(argv) {
  const only = argv.filter((a) => !a.startsWith('-'));
  const failed = [];

  for (const stage of STAGES) {
    console.log(bold(`\n[${stage.name}] ${stage.why}`));
    const args = [stage.script, ...(stage.perSkill ? only : [])];
    const result = spawnSync('node', args, { cwd: REPO_ROOT, stdio: 'inherit' });
    if (result.status !== 0) failed.push(stage.name);
  }

  console.log('');
  if (failed.length === 0) {
    console.log(green('All checks passed.'));
    console.log(dim('Next: npm run save "what you did"'));
    return 0;
  }
  console.log(red(`Failed: ${failed.join(', ')}.`));
  console.log('Each line above says which skill and what to run. The usual fix is:');
  console.log(dim('  npm run regression -- <skill-name>     re-runs that skill\'s tests and records the result'));
  console.log(dim('  npm run test:new -- <skill-name>       writes the tests that are missing'));
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
