#!/usr/bin/env node
// A deliberately small lint: syntax checks in every language this repo uses, plus
// the handful of house rules that actually bite here. No dependencies, so it runs
// on a fresh clone with nothing installed.
//
//   npm run lint            everything
//   npm run lint -- --list  what it checks and why
//
// If eslint happens to be installed it also runs, using eslint.config.mjs. It is
// never required: `npm run lint` is fully useful without it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './lib/skills.mjs';
import { bold, dim, green, printFindings, yellow } from './lib/report.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.pytest_cache', 'tmp', 'outputs']);
const NUL = String.fromCharCode(0);

/** Every file under root worth linting. */
export function collectFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push(abs);
    }
  };
  walk(root);
  return files.sort();
}

// --- house rules --------------------------------------------------------------
// Each rule takes { rel, text } and returns messages. Keep this list short: a rule
// earns its place by catching something that has actually gone wrong here.
export const RULES = [
  {
    id: 'final-newline',
    why: 'a missing trailing newline makes every later diff touch the last line',
    applies: (rel) => /\.(mjs|js|py|json|md|sh|yml|yaml)$/.test(rel),
    check: ({ text }) => (text.length && !text.endsWith('\n') ? ['file does not end with a newline'] : []),
  },
  {
    id: 'no-crlf',
    why: 'mixed line endings change the content hash the freshness rule depends on',
    applies: () => true,
    check: ({ text }) => (text.includes('\r\n') ? ['file has Windows line endings (CRLF)'] : []),
  },
  {
    id: 'no-trailing-whitespace',
    why: 'invisible diff noise',
    applies: (rel) => /\.(mjs|js|py|json|sh)$/.test(rel),
    check: ({ text }) =>
      text
        .split('\n')
        .map((line, i) => (/[ \t]+$/.test(line) ? `line ${i + 1}: trailing whitespace` : null))
        .filter(Boolean),
  },
  {
    id: 'no-tabs',
    why: 'Python indentation must not mix tabs and spaces; the rest follows for consistency',
    applies: (rel) => /\.(mjs|js|py)$/.test(rel),
    check: ({ text }) =>
      text
        .split('\n')
        .map((line, i) => (/^\t/.test(line) ? `line ${i + 1}: indented with a tab` : null))
        .filter(Boolean),
  },
  {
    id: 'no-unfinished-markers',
    why: 'the rule the skill format applies to SKILL.md, applied to the code as well: ship it finished',
    // Exempt: this file (it defines the pattern) and tests (which use the markers as fixtures).
    applies: (rel) => /\.(mjs|py)$/.test(rel) && rel !== 'scripts/lint.mjs' && !rel.startsWith('tests/'),
    check: ({ text }) => {
      const hits = [...new Set([...text.matchAll(/\b(TODO|FIXME|XXX)\b/g)].map((m) => m[1]))];
      return hits.length ? [`contains ${hits.join(', ')}`] : [];
    },
  },
  {
    id: 'cli-has-main-guard',
    why: 'without the guard a script runs its CLI on import, breaking the tests that import it',
    applies: (rel) => /^scripts\/[^/]+\.mjs$/.test(rel),
    check: ({ text }) =>
      !text.includes('function main') || text.includes('import.meta.url === `file://${process.argv[1]}`')
        ? []
        : ['defines main() but has no import.meta.url === file://process.argv[1] guard'],
  },
  {
    id: 'libraries-do-not-print',
    why: 'lib/ returns findings; printing belongs to the CLI that called it, or the output cannot be tested',
    applies: (rel) =>
      rel.startsWith('scripts/lib/') && rel.endsWith('.mjs') && !['scripts/lib/report.mjs', 'scripts/lib/prompt.mjs'].includes(rel),
    check: ({ text }) =>
      text
        .split('\n')
        .map((line, i) => (/(^|[^.\w])console\.(log|error|warn|info)\(/.test(line) ? `line ${i + 1}: console output from a library` : null))
        .filter(Boolean),
  },
  {
    id: 'harness-is-deterministic',
    why: 'the harness measures determinism, so it cannot itself depend on the clock or unseeded randomness',
    applies: (rel) => rel.startsWith('harness/skillharness/') && rel.endsWith('.py'),
    check: ({ text }) =>
      [
        ['random.', /\brandom\.\w+\(/],
        ['datetime.now(', /\bdatetime\.now\(/],
        ['time.time(', /\btime\.time\(/],
      ]
        .filter(([, re]) => re.test(text))
        .map(([name]) => `uses ${name} — not reproducible`),
  },
  {
    id: 'json-parses',
    why: 'a broken manifest or case file otherwise fails much later, with a worse message',
    applies: (rel) => rel.endsWith('.json'),
    check: ({ text }) => {
      try {
        JSON.parse(text);
        return [];
      } catch (err) {
        return [`invalid JSON: ${err.message}`];
      }
    },
  },
];

/** Syntax checks, one language at a time. */
function syntaxFindings(root, files) {
  const findings = [];
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/');

  for (const file of files.filter((f) => f.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      findings.push({ level: 'error', message: `syntax: ${result.stderr.split('\n').find((l) => l.includes('Error')) ?? 'parse error'}`, where: rel(file) });
    }
  }

  for (const file of files.filter((f) => f.endsWith('.sh'))) {
    const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      findings.push({ level: 'error', message: `syntax: ${result.stderr.trim().split('\n')[0]}`, where: rel(file) });
    }
  }

  const pythonFiles = files.filter((f) => f.endsWith('.py'));
  if (pythonFiles.length && spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0) {
    // compile() rather than py_compile: py_compile writes .pyc files next to the
    // sources, which raced with the harness tests importing those same modules.
    const program = [
      'import sys',
      'for f in sys.argv[1:]:',
      '    src = open(f, encoding="utf-8").read()',
      '    try:',
      '        compile(src, f, "exec")',
      '    except SyntaxError as err:',
      '        print(f"{f}:{err.lineno}: {err.msg}")',
      '        sys.exit(1)',
    ].join('\n');
    const result = spawnSync('python3', ['-c', program, ...pythonFiles], { encoding: 'utf8' });
    if (result.status !== 0) {
      const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').at(-1);
      findings.push({ level: 'error', message: `python syntax: ${detail}`, where: 'python' });
    }
  }

  return findings;
}

/** Run the whole lint over a root directory. Returns findings; never throws. */
export function lint(root = REPO_ROOT) {
  const files = collectFiles(root);
  const findings = syntaxFindings(root, files);

  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes(NUL)) continue; // binary

    for (const rule of RULES) {
      if (!rule.applies(rel)) continue;
      for (const message of rule.check({ rel, text })) {
        findings.push({ level: 'error', message: `${rule.id}: ${message}`, where: rel });
      }
    }
  }

  return findings;
}

/**
 * eslint, only when it is installed *in this repo*. Deliberately not `npx`: that
 * walks up the directory tree and would silently borrow a parent project's eslint
 * (and its version), which is exactly the coupling this repo does without.
 */
function optionalEslint(root) {
  const binary = path.join(root, 'node_modules', '.bin', 'eslint');
  if (!fs.existsSync(binary)) return { ran: false, findings: [] };
  const result = spawnSync(binary, ['.'], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) return { ran: true, findings: [] };
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { ran: true, findings: [{ level: 'error', message: `eslint:\n${output}`, where: 'eslint' }] };
}

function main(argv) {
  if (argv.includes('--list')) {
    console.log(bold('house rules'));
    for (const rule of RULES) console.log(`  ${rule.id.padEnd(26)} ${dim(rule.why)}`);
    console.log(bold('\nsyntax'));
    for (const [what, over] of [['node --check', 'every .mjs'], ['python3 -m py_compile', 'every .py'], ['bash -n', 'every .sh']]) {
      console.log(`  ${what.padEnd(26)} ${dim(over)}`);
    }
    console.log(dim('\neslint also runs when it is installed, but nothing here requires it.'));
    return 0;
  }

  const findings = lint();
  const eslint = optionalEslint(REPO_ROOT);
  const errors = printFindings('lint', [...findings, ...eslint.findings]);
  if (!eslint.ran) console.log(dim('  eslint not installed — house rules and syntax checks only, which is the intended default'));
  console.log(
    errors === 0
      ? green(`\n${collectFiles(REPO_ROOT).length} file(s) clean`)
      : yellow(`\n${errors} problem(s). npm run lint -- --list explains each rule.`),
  );
  return errors ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
