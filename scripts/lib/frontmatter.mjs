// Minimal YAML-frontmatter parser — deliberately small and dependency-free.
// Supports what the skill format allows: scalars, quoted scalars, block scalars
// (| |- > >-), one level of nested maps, and block sequences.

export class FrontmatterError extends Error {}

const unquote = (s) => {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
};

const coerce = (s) => {
  const t = unquote(s);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~' || t === '') return t === '' ? '' : null;
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
};

const indentOf = (line) => line.length - line.trimStart().length;

/** Split a document into { frontmatter: rawYaml|null, body, bodyStartLine }. */
export function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { frontmatter: null, body: text, bodyStartLine: 1 };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) throw new FrontmatterError('frontmatter opened with --- but never closed');
  return {
    frontmatter: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
    bodyStartLine: end + 2,
  };
}

/** Parse the restricted YAML subset above into a plain object. */
export function parseYaml(raw) {
  const lines = raw.split('\n');
  const out = {};
  let i = 0;

  const readBlock = (baseIndent, fold, chomp) => {
    const collected = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') { collected.push(''); i++; continue; }
      if (indentOf(line) <= baseIndent) break;
      collected.push(line);
      i++;
    }
    while (collected.length && collected.at(-1) === '') collected.pop();
    const nonEmpty = collected.filter((l) => l.trim() !== '');
    const minIndent = nonEmpty.length ? Math.min(...nonEmpty.map(indentOf)) : 0;
    const dedented = collected.map((l) => l.slice(minIndent));
    let value;
    if (fold) {
      value = dedented
        .reduce((acc, l) => {
          if (l.trim() === '') { acc.push(''); return acc; }
          if (acc.length === 0 || acc.at(-1) === '') acc.push(l.trim());
          else acc[acc.length - 1] += ' ' + l.trim();
          return acc;
        }, [])
        .join('\n');
    } else {
      value = dedented.join('\n');
    }
    return chomp === 'strip' ? value.replace(/\n+$/, '') : value.replace(/\n*$/, '\n');
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) { i++; continue; }
    if (indentOf(line) !== 0) throw new FrontmatterError(`unexpected indentation: "${line}"`);
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) throw new FrontmatterError(`cannot parse line: "${line}"`);
    const [, key, rest] = m;
    i++;

    const blockMatch = /^([|>])([-+]?)$/.exec(rest.trim());
    if (blockMatch) {
      const [, style, chompFlag] = blockMatch;
      out[key] = readBlock(0, style === '>', chompFlag === '-' ? 'strip' : 'keep');
      continue;
    }
    if (rest.trim() !== '') { out[key] = coerce(rest); continue; }

    // Nested block: sequence or map.
    const nested = [];
    while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > 0)) {
      if (lines[i].trim() !== '') nested.push(lines[i]);
      i++;
    }
    if (nested.length === 0) { out[key] = null; continue; }
    if (nested[0].trimStart().startsWith('- ')) {
      out[key] = nested.map((l) => coerce(l.trimStart().slice(2)));
    } else {
      const map = {};
      for (const l of nested) {
        const mm = /^\s*([A-Za-z0-9_-]+):\s*(.*)$/.exec(l);
        if (!mm) throw new FrontmatterError(`cannot parse nested line: "${l}"`);
        map[mm[1]] = coerce(mm[2]);
      }
      out[key] = map;
    }
  }
  return out;
}

/** Convenience: split + parse in one call. */
export function readFrontmatter(text) {
  const { frontmatter, body, bodyStartLine } = splitFrontmatter(text);
  if (frontmatter === null) return { data: null, body, bodyStartLine };
  return { data: parseYaml(frontmatter), body, bodyStartLine };
}
