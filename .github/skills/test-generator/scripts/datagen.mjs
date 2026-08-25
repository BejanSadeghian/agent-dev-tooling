#!/usr/bin/env node
// Deterministic synthetic test-data generator.
// Same spec + same seed => byte-identical output, always. No network, no clock.
//
//   node scripts/datagen.mjs --spec spec.json --seed 42 --rows 50 --format csv
//   node scripts/datagen.mjs --spec spec.json --seed 42 --edge-cases --out fixtures/users.json
//
// Spec: { "name": "users", "fields": [ { "name": "...", "type": "...", ...opts } ] }
// Types: uuid | int | float | bool | enum | string | text | name | email | date | pattern | ref
import fs from 'node:fs';
import path from 'node:path';

// --- deterministic RNG (mulberry32) -----------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const int = (r, min, max) => min + Math.floor(r() * (max - min + 1));

const FIRST = ['ada', 'grace', 'alan', 'edsger', 'barbara', 'ken', 'radia', 'linus', 'margaret', 'donald'];
const LAST = ['lovelace', 'hopper', 'turing', 'dijkstra', 'liskov', 'thompson', 'perlman', 'torvalds', 'hamilton', 'knuth'];
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
const DAY_MS = 86_400_000;

// --- generators --------------------------------------------------------------
const GENERATORS = {
  uuid: (r) => {
    const hex = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 32; i++) s += hex[int(r, 0, 15)];
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`;
  },
  int: (r, f) => int(r, f.min ?? 0, f.max ?? 1000),
  float: (r, f) => {
    const min = f.min ?? 0;
    const max = f.max ?? 1;
    const p = f.precision ?? 2;
    return Number((min + r() * (max - min)).toFixed(p));
  },
  bool: (r) => r() < 0.5,
  enum: (r, f) => pick(r, f.values ?? ['a', 'b', 'c']),
  string: (r, f) => {
    const len = int(r, f.minLength ?? 4, f.maxLength ?? 12);
    const alphabet = f.alphabet ?? 'abcdefghijklmnopqrstuvwxyz';
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[int(r, 0, alphabet.length - 1)];
    return s;
  },
  text: (r, f) => Array.from({ length: f.words ?? 8 }, () => pick(r, WORDS)).join(' '),
  name: (r) => `${pick(r, FIRST)} ${pick(r, LAST)}`,
  email: (r, f) =>
    `${pick(r, FIRST)}.${pick(r, LAST)}${int(r, 1, 99)}@${f.domain ?? 'example.test'}`,
  date: (r, f) => {
    const from = Date.parse(f.from ?? '2020-01-01T00:00:00Z');
    const to = Date.parse(f.to ?? '2026-01-01T00:00:00Z');
    const ms = from + Math.floor(r() * (to - from));
    const iso = new Date(Math.floor(ms / DAY_MS) * DAY_MS).toISOString();
    return f.dateOnly === false ? iso : iso.slice(0, 10);
  },
  pattern: (r, f) =>
    // "AA-###" style: A -> letter, # -> digit, everything else literal.
    [...(f.pattern ?? '###')]
      .map((ch) =>
        ch === '#' ? String(int(r, 0, 9)) : ch === 'A' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[int(r, 0, 25)] : ch,
      )
      .join(''),
  ref: (r, f, ctx) => {
    const pool = ctx.refs[f.from];
    if (!pool || pool.length === 0) throw new Error(`ref pool "${f.from}" is empty — pass --ref ${f.from}=<file>`);
    return pick(r, pool);
  },
};

// Boundary/adversarial values injected by --edge-cases, per type.
const EDGE_VALUES = {
  int: (f) => [f.min ?? 0, (f.min ?? 0) - 1, f.max ?? 1000, (f.max ?? 1000) + 1, 0],
  float: (f) => [f.min ?? 0, f.max ?? 1, 0],
  string: () => ['', ' ', 'a'.repeat(255), "o'brien", '<script>alert(1)</script>', 'ünïcødé ✅', 'a,b"c\nd'],
  text: () => ['', 'a'.repeat(1024)],
  name: () => ["o'brien", 'ünïcødé ✅', ''],
  email: () => ['a@b.co', 'not-an-email', `${'a'.repeat(64)}@example.test`],
  date: () => ['1970-01-01', '2038-01-19', '2000-02-29'],
  bool: () => [true, false],
  enum: (f) => (f.values ?? []).slice(0, 3),
  uuid: () => ['00000000-0000-4000-a000-000000000000'],
  pattern: () => [],
  ref: () => [],
};

function generateRow(r, spec, ctx) {
  const row = {};
  for (const field of spec.fields) {
    const gen = GENERATORS[field.type];
    if (!gen) throw new Error(`unknown field type "${field.type}" for field "${field.name}"`);
    if (field.nullable && r() < (field.nullRate ?? 0.1)) {
      row[field.name] = null;
      continue;
    }
    row[field.name] = gen(r, field, ctx);
  }
  return row;
}

/** Rows that pin the boundaries: one row per edge value, other fields kept normal. */
function generateEdgeRows(r, spec, ctx) {
  const rows = [];
  for (const field of spec.fields) {
    const values = (EDGE_VALUES[field.type] ?? (() => []))(field);
    for (const value of values) {
      rows.push({ ...generateRow(r, spec, ctx), [field.name]: value });
    }
    if (field.nullable) rows.push({ ...generateRow(r, spec, ctx), [field.name]: null });
  }
  return rows;
}

export function generate(spec, { seed = 1, rows = 10, edgeCases = false, refs = {} } = {}) {
  const r = rng(seed);
  const ctx = { refs };
  const out = edgeCases ? generateEdgeRows(r, spec, ctx) : [];
  for (let i = 0; i < rows; i++) out.push(generateRow(r, spec, ctx));
  return out;
}

// --- serialisation -----------------------------------------------------------
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function serialise(rows, format, spec) {
  const columns = spec.fields.map((f) => f.name);
  switch (format) {
    case 'json':
      return JSON.stringify(rows, null, 2) + '\n';
    case 'ndjson':
      return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
    case 'csv':
      return [columns.join(','), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(','))].join('\n') + '\n';
    default:
      throw new Error(`unknown format "${format}" (json | ndjson | csv)`);
  }
}

// --- cli ---------------------------------------------------------------------
function parseArgs(argv) {
  const args = { seed: 1, rows: 10, format: 'json', edgeCases: false, refs: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--spec') args.spec = next();
    else if (a === '--seed') args.seed = Number(next());
    else if (a === '--rows') args.rows = Number(next());
    else if (a === '--format') args.format = next();
    else if (a === '--out') args.out = next();
    else if (a === '--edge-cases') args.edgeCases = true;
    else if (a === '--ref') {
      const [name, file] = next().split('=');
      args.refs[name] = file;
    } else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument "${a}"`);
  }
  return args;
}

const USAGE = `datagen — deterministic synthetic test data

  --spec <file>     field spec (JSON, required)
  --seed <n>        RNG seed (default 1) — same seed, same bytes
  --rows <n>        random rows to emit (default 10)
  --edge-cases      prepend one row per boundary/adversarial value
  --format <fmt>    json | ndjson | csv (default json)
  --ref <name>=<f>  load a ref pool: a JSON array, or objects with the ref field
  --out <file>      write to a file instead of stdout
`;

function loadRefPools(refSpec, specDir) {
  const refs = {};
  for (const [name, file] of Object.entries(refSpec)) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(specDir, file), 'utf8'));
    const [, field] = name.split('.');
    refs[name] = Array.isArray(parsed)
      ? parsed.map((row) => (field && typeof row === 'object' && row !== null ? row[field] : row))
      : Object.values(parsed);
  }
  return refs;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    return 2;
  }
  if (args.help || !args.spec) {
    console.log(USAGE);
    return args.help ? 0 : 2;
  }
  const specPath = path.resolve(args.spec);
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const refs = loadRefPools(args.refs, path.dirname(specPath));
  const rows = generate(spec, { seed: args.seed, rows: args.rows, edgeCases: args.edgeCases, refs });
  const text = serialise(rows, args.format, spec);
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, text);
    console.log(`${rows.length} row(s) -> ${args.out}`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
