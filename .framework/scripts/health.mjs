#!/usr/bin/env node
// The anti-degradation report. As a library of skills grows, quality rots in
// predictable ways: suites stop being re-run, triggers start overlapping, artifacts
// lose their tests, performance drifts, sequences stop joining up. This names every
// one of those in plain language, for every skill, in one place.
//
//   npm run health              # the scoreboard
//   npm run health -- --markdown
import fs from 'node:fs';
import path from 'node:path';
import { checkRubric } from './check-rubric.mjs';
import { validateSkill } from './validate-skill.mjs';
import { coverageGaps, pairFindings, roleOf } from './lib/roles.mjs';
import { hasPythonCode, readPerf } from './lib/python.mjs';
import { readFrontmatter } from './lib/frontmatter.mjs';
import { REPO_ROOT, discoverSkills, hashSkill, loadCases, loadConfig, readState } from './lib/skills.mjs';
import { bold, dim, green, red, yellow } from './lib/report.mjs';

const DAY_MS = 86_400_000;
const STOP_WORDS = new Set(
  'the a an and or of to for in on with when use uses using this that it its into from by as at is are be been being any all each every skill agent user users request requests them they their you your'.split(' '),
);

const tokens = (text) =>
  new Set(
    (text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );

export function jaccard(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function inspect(config, root = REPO_ROOT, now = Date.now()) {
  const skills = discoverSkills(config, root);
  const rows = [];
  const issues = [];
  const note = (level, skill, message, fix) => issues.push({ level, skill, message, fix });

  const descriptions = [];

  for (const skill of skills) {
    const { cases } = loadCases(config, skill.dir);
    const state = readState(config, skill.name, root);
    const formatErrors = validateSkill(config, skill).filter((f) => f.level !== 'warn');
    const rubricErrors = checkRubric(config, skill, root).filter((f) => f.level !== 'warn');
    const gaps = coverageGaps(config, skill, cases);
    const ageDays = state?.ranAt ? Math.floor((now - Date.parse(state.ranAt)) / DAY_MS) : null;
    const fresh = state ? state.contentHash === hashSkill(skill.dir) : false;
    const perf = readPerf(config, skill.name, root);

    const skillMd = path.join(skill.dir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      try {
        const { data } = readFrontmatter(fs.readFileSync(skillMd, 'utf8'));
        if (data?.description) descriptions.push({ skill: skill.name, description: data.description });
      } catch {
        /* the format validator reports this */
      }
    }

    if (formatErrors.length) note('error', skill.name, `${formatErrors.length} format problem(s)`, `npm run validate -- ${skill.name}`);
    // R3/R4/R5/R8/R9 are reported below in plainer words; don't say it twice.
    const otherRubric = rubricErrors.filter((f) => !/^(format:|R3 |R4 |R5 |R8 |R9 )/.test(f.message));
    for (const f of otherRubric) note('error', skill.name, f.message, 'npm run check');
    if (!state) note('error', skill.name, 'its tests have never been run', `npm run regression -- ${skill.name}`);
    else if (!fresh) note('error', skill.name, 'edited since its tests last ran', `npm run regression -- ${skill.name}`);
    else if (state.passed !== true) note('error', skill.name, 'its last test run failed', `npm run regression -- ${skill.name}`);
    if (gaps.length) note('error', skill.name, `${gaps.length} artifact/code test gap(s)`, `npm run test:new -- ${skill.name}`);
    if (cases.length < config.health.minCasesPerSkillWarn) {
      note('warn', skill.name, `only ${cases.length} regression case(s) — thin cover for anything real`, 'add a case for each hard rule');
    }
    if (ageDays !== null && ageDays > config.health.staleAfterDays) {
      note('warn', skill.name, `not exercised in ${ageDays} days — nobody knows if it still works`, `npm run regression -- ${skill.name}`);
    }
    if (hasPythonCode(config, skill.dir) && !perf) {
      note('warn', skill.name, 'has Python but no performance report', `npm run regression -- ${skill.name}`);
    }

    const budget = config.perf.maxExponentDefault;
    for (const m of perf?.measurements ?? []) {
      if (m.scaling.exponent > budget) {
        note('error', skill.name, `${m.target} scales as n^${m.scaling.exponent} (${m.scaling.class}), over its n^${budget} budget`, 'make the algorithm cheaper, or raise the budget deliberately');
      }
    }

    rows.push({
      skill: skill.name,
      role: roleOf(config, skill) ?? '??',
      cases: cases.length,
      python: hasPythonCode(config, skill.dir) ? 'yes' : 'no',
      testedDaysAgo: ageDays,
      fresh,
      green: state?.passed === true,
      gaps: gaps.length,
      slowest: (perf?.measurements ?? []).reduce((worst, m) => Math.max(worst, m.scaling.exponent), 0) || null,
      ok: formatErrors.length === 0 && rubricErrors.length === 0 && gaps.length === 0,
    });
  }

  // Triggers that have started to overlap — the classic library-growth failure.
  for (let i = 0; i < descriptions.length; i++) {
    for (let j = i + 1; j < descriptions.length; j++) {
      const score = jaccard(descriptions[i].description, descriptions[j].description);
      if (score >= config.health.triggerOverlapWarn) {
        note(
          'warn',
          `${descriptions[i].skill} + ${descriptions[j].skill}`,
          `descriptions are ${Math.round(score * 100)}% alike — the agent may fire the wrong one`,
          'sharpen one description, or merge the two skills',
        );
      }
    }
  }

  // Every use case ships as a pair: a doer without its interpreter (or the
  // reverse) is the framework's one deliberate warning-not-blocker.
  for (const finding of pairFindings(config, skills)) {
    note(finding.level, finding.skill, finding.message, 'npm run skill:new — it scaffolds the missing half');
  }

  return { rows, issues };
}

function renderMarkdown({ rows, issues }) {
  const lines = ['### Skill library health', '', '| skill | role | cases | python | tested | green | gaps | worst scaling |', '|---|---|---:|---|---|---|---:|---|'];
  for (const r of rows) {
    lines.push(
      `| ${r.skill} | ${r.role} | ${r.cases} | ${r.python} | ${
        r.testedDaysAgo === null ? 'never' : r.fresh ? `${r.testedDaysAgo}d ago` : 'stale'
      } | ${r.green ? 'yes' : 'no'} | ${r.gaps} | ${r.slowest ? `n^${r.slowest}` : '—'} |`,
    );
  }
  lines.push('');
  if (issues.length === 0) lines.push('No issues.');
  for (const issue of issues) lines.push(`- **${issue.level}** ${issue.skill}: ${issue.message} → \`${issue.fix}\``);
  return lines.join('\n');
}

function main(argv) {
  const config = loadConfig();
  const result = inspect(config);

  if (argv.includes('--markdown')) {
    console.log(renderMarkdown(result));
  } else if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(bold('skill library health\n'));
    const width = Math.max(...result.rows.map((r) => r.skill.length), 5);
    console.log(dim(`${'skill'.padEnd(width)}  role         cases  python  tested        green  gaps`));
    for (const r of result.rows) {
      const tested = r.testedDaysAgo === null ? 'never' : r.fresh ? `${r.testedDaysAgo}d ago` : 'STALE';
      const mark = r.ok && r.green ? green('ok ') : red('!! ');
      console.log(
        `${mark}${r.skill.padEnd(width)}  ${r.role.padEnd(11)}  ${String(r.cases).padStart(5)}  ${r.python.padEnd(6)}  ${tested.padEnd(12)}  ${
          r.green ? green('yes') : red('no ')
        }    ${r.gaps}`,
      );
    }
    console.log('');
    const errors = result.issues.filter((i) => i.level === 'error');
    const warns = result.issues.filter((i) => i.level === 'warn');
    for (const issue of errors) console.log(`${red('needs fixing')}  ${issue.skill}: ${issue.message}\n              → ${issue.fix}`);
    for (const issue of warns) console.log(`${yellow('worth a look')}  ${issue.skill}: ${issue.message}\n              → ${issue.fix}`);
    console.log(
      errors.length
        ? red(`\n${errors.length} thing(s) to fix, ${warns.length} to look at.`)
        : green(`\nHealthy: ${result.rows.length} skill(s), nothing to fix${warns.length ? `, ${warns.length} to look at` : ''}.`),
    );
  }

  return result.issues.some((i) => i.level === 'error') ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
