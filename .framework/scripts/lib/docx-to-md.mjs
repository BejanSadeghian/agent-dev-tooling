// docx-to-md.mjs — dependency-free .docx → Markdown conversion.
//
// A .docx file is a zip of XML parts. This module unzips it with a minimal
// reader (Node's built-in zlib handles the inflation) and walks
// word/document.xml, translating paragraphs, headings, lists, tables, and
// bold/italic runs into Markdown. It covers the constructs process-flow
// source documents actually use; it is not a full OOXML renderer.

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LF_SIG = 0x04034b50;

// --- minimal zip reader -----------------------------------------------------

function findEocd(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** @returns {Map<string, Buffer>} entry name → uncompressed bytes */
export function unzipDocx(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('not a zip file (EOCD not found)');
  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(p) !== CD_SIG) throw new Error('corrupt central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (buf.readUInt32LE(localOffset) !== LF_SIG) throw new Error(`bad local header for ${name}`);
    const lfNameLen = buf.readUInt16LE(localOffset + 26);
    const lfExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lfNameLen + lfExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : null;
    if (!data) throw new Error(`unsupported compression method ${method} for ${name}`);
    entries.set(name, data);
  }
  return entries;
}

// --- tiny XML walker ---------------------------------------------------------

const TAG_RE = /<(\/?)([A-Za-z_][\w.-]*(?::[\w.-]+)?)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const ATTR_RE = /([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g;

function parseTag(tag) {
  const m = /^<(\/?)([^\s/>]+)([\s\S]*?)(\/?)>$/.exec(tag);
  const attrs = {};
  let am;
  ATTR_RE.lastIndex = 0;
  while ((am = ATTR_RE.exec(m[3]))) attrs[am[1]] = am[2].slice(1, -1);
  return { closing: m[1] === '/', name: m[2], attrs, selfClosing: m[4] === '/' || tag.endsWith('/>') };
}

function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// --- document → markdown -----------------------------------------------------

// Styles can carry the numbering instead of the paragraph itself (Word and
// python-docx emit style-based lists like ListBullet with no direct w:numPr).
// Returns styleId → { numId, ilvl }, following w:basedOn one chain deep.
function styleNumbering(stylesXml) {
  const styles = new Map();
  if (!stylesXml) return styles;
  const blocks = stylesXml.match(/<w:style\b[\s\S]*?<\/w:style>/g) || [];
  for (const block of blocks) {
    const id = /w:styleId="([^"]+)"/.exec(block)?.[1];
    if (!id) continue;
    const numId = /<w:numPr>[\s\S]*?<w:numId\b[^>]*w:val="(\d+)"/.exec(block)?.[1] || null;
    const ilvl = /<w:numPr>[\s\S]*?<w:ilvl\b[^>]*w:val="(\d+)"/.exec(block)?.[1] || '0';
    const basedOn = /<w:basedOn\b[^>]*w:val="([^"]+)"/.exec(block)?.[1] || null;
    styles.set(id, { numId, ilvl, basedOn });
  }
  const resolved = new Map();
  const resolve = (id, seen = new Set()) => {
    if (resolved.has(id)) return resolved.get(id);
    if (seen.has(id)) return null;
    seen.add(id);
    const s = styles.get(id);
    if (!s) return null;
    const out = s.numId ? { numId: s.numId, ilvl: s.ilvl }
      : s.basedOn ? resolve(s.basedOn, seen) : null;
    resolved.set(id, out);
    return out;
  };
  for (const id of styles.keys()) resolve(id);
  return resolved;
}

// numId → numFmt ("bullet" | "decimal" | ...) for the top level
function numberingFormats(numberingXml) {
  const formats = new Map();
  if (!numberingXml) return formats;
  const abstract = new Map();
  let cur = null;
  let re = /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"|<\/w:abstractNum>|<w:lvl\b[^>]*w:ilvl="(\d+)"|<w:numFmt\b[^>]*w:val="([^"]+)"|<\/w:lvl>/g;
  let m;
  while ((m = re.exec(numberingXml))) {
    if (m[1] !== undefined) cur = { id: m[1], levels: new Map() };
    else if (m[2] !== undefined && cur) cur.level = m[2];
    else if (m[3] !== undefined && cur) cur.levels.set(cur.level ?? '0', m[3]);
    else if (cur && /<\/w:abstractNum>/.test(m[0])) { abstract.set(cur.id, cur.levels); cur = null; }
  }
  re = /<w:num\b[^>]*w:numId="(\d+)"[\s\S]*?<w:abstractNumId\b[^>]*w:val="(\d+)"/g;
  while ((m = re.exec(numberingXml))) {
    const lvls = abstract.get(m[2]);
    if (lvls) formats.set(m[1], lvls.get('0') || 'bullet');
  }
  return formats;
}

export function docxToMarkdown(docxBuffer) {
  const parts = unzipDocx(Buffer.from(docxBuffer));
  const documentXml = parts.get('word/document.xml');
  if (!documentXml) throw new Error('word/document.xml not found — not a .docx file');
  const numFmts = numberingFormats(parts.get('word/numbering.xml')?.toString('utf8'));
  const styleNums = styleNumbering(parts.get('word/styles.xml')?.toString('utf8'));

  const xml = documentXml.toString('utf8');
  const blocks = [];
  const stack = [];
  let para = null; // { style, numId, ilvl, runs: [{text, bold, italic}], breaks }
  let table = null; // { rows: [[cellText]] }
  let cell = null;
  let runFmt = null;
  let skipDepth = 0; // for w:instrText / w:delText / drawings

  function startPara() {
    para = { style: null, numId: null, ilvl: '0', runs: [] };
    runFmt = { bold: false, italic: false };
  }

  function pushText(text) {
    if (!para || skipDepth > 0) return;
    const t = decodeEntities(text);
    if (!t) return;
    const last = para.runs[para.runs.length - 1];
    if (last && last.bold === runFmt.bold && last.italic === runFmt.italic && !last.breakAfter) {
      last.text += t;
    } else {
      para.runs.push({ text: t, bold: runFmt.bold, italic: runFmt.italic });
    }
  }

  function renderPara(p) {
    // Whitespace is collapsed per run; hard breaks become a '\n' marker that
    // is expanded to a Markdown line break after the collapse.
    const parts = [];
    for (const r of p.runs) {
      let t = r.text.replace(/[ \t]+/g, ' ');
      if (r.bold && r.italic) t = `***${t}***`;
      else if (r.bold) t = `**${t}**`;
      else if (r.italic) t = `*${t}*`;
      if (t) parts.push(t);
      if (r.breakAfter) parts.push('\n');
    }
    let text = parts.join('').replace(/ *\n */g, '  \n').trim();
    if (!text) return null;
    const heading = /^Heading([1-6])$/.exec(p.style || '');
    if (heading) return `${'#'.repeat(Number(heading[1]))} ${text}`;
    // Numbering can sit on the paragraph directly or come from its style.
    const list = p.numId ? { numId: p.numId, ilvl: p.ilvl } : (p.style && styleNums.get(p.style));
    if (list) {
      const indent = '  '.repeat(Number(list.ilvl || 0));
      const bullet = (numFmts.get(list.numId) || 'bullet') === 'decimal' ? '1.' : '-';
      return `${indent}${bullet} ${text}`;
    }
    return text;
  }

  function endPara() {
    if (!para) return;
    const rendered = renderPara(para);
    if (rendered) {
      if (cell) cell.push(rendered);
      else blocks.push(rendered);
    }
    para = null;
  }

  TAG_RE.lastIndex = 0;
  let lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(xml))) {
    if (m.index > lastIndex) pushText(xml.slice(lastIndex, m.index));
    lastIndex = TAG_RE.lastIndex;
    const { closing, name, attrs, selfClosing } = parseTag(m[0]);

    if (name === 'w:instrText' || name === 'w:delText' || name === 'w:drawing' || name === 'wp:inline') {
      if (!closing && !selfClosing) skipDepth++;
      else if (closing) skipDepth = Math.max(0, skipDepth - 1);
      continue;
    }
    if (skipDepth > 0) continue;

    if (!closing) {
      stack.push(name);
      switch (name) {
        case 'w:p': startPara(); break;
        case 'w:r': runFmt = { bold: false, italic: false }; break;
        // <w:b/> means on; <w:b w:val="0"/> (Word's explicit off) means off.
        case 'w:b': if (stack.includes('w:rPr')) runFmt.bold = !['0', 'false', 'off'].includes(attrs['w:val']); break;
        case 'w:i': if (stack.includes('w:rPr')) runFmt.italic = !['0', 'false', 'off'].includes(attrs['w:val']); break;
        case 'w:t': break; // text arrives as character data
        case 'w:tab': pushText(' '); break;
        case 'w:br': if (para) para.runs.push({ text: '', bold: false, italic: false, breakAfter: true }); break;
        case 'w:tbl': table = { rows: [] }; break;
        case 'w:tr': if (table) table.rows.push([]); break;
        case 'w:tc': cell = []; break;
        case 'w:pStyle': if (para) para.style = attrs['w:val'] || null; break;
        case 'w:numId': if (para) para.numId = attrs['w:val'] || null; break;
        case 'w:ilvl': if (para) para.ilvl = attrs['w:val'] || '0'; break;
      }
      if (selfClosing) {
        stack.pop();
        if (name === 'w:br' || name === 'w:tab') { /* already handled */ }
      }
    } else {
      // closing tag — pop back to it
      while (stack.length && stack[stack.length - 1] !== name) stack.pop();
      stack.pop();
      switch (name) {
        case 'w:p': endPara(); break;
        case 'w:tc':
          if (table && cell) table.rows[table.rows.length - 1].push(cell.join(' '));
          cell = null;
          break;
        case 'w:tbl':
          if (table && table.rows.length) {
            const rows = table.rows.filter((r) => r.some((c) => c.trim()));
            if (rows.length) {
              const width = Math.max(...rows.map((r) => r.length));
              const norm = rows.map((r) => { const c = r.slice(); while (c.length < width) c.push(''); return c; });
              const md = [norm[0]];
              if (norm.length > 1) md.push(norm[0].map(() => '---'));
              md.push(...norm.slice(1));
              blocks.push(md.map((r) => `| ${r.join(' | ')} |`).join('\n'));
            }
          }
          table = null;
          break;
      }
    }
  }

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
