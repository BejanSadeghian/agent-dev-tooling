// docx-to-md.test.mjs — the .docx → Markdown converter behind --source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { docxToMarkdown, unzipDocx } from '../scripts/lib/docx-to-md.mjs';

// --- minimal zip builder (stored + deflated entries) -------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  // files: [[name, Buffer, method]] — method 0 = stored, 8 = deflated
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data, method] of files) {
    const payload = method === 8 ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32(data), 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    chunks.push(lh, nameBuf, payload);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc32(data), 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += lh.length + nameBuf.length + payload.length;
  }
  const cdStart = offset;
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Process Overview</w:t></w:r></w:p>
<w:p><w:r><w:t>The </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>monthly close</w:t></w:r><w:r><w:t> runs on the </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>fifth</w:t></w:r><w:r><w:t> business day.</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First bullet</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>First numbered</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Field</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Type</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>amount</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>number</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Details</w:t></w:r></w:p>
<w:p><w:r><w:t>Line one</w:t></w:r><w:r><w:br/><w:t>line two</w:t></w:r></w:p>
</w:body></w:document>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

function testDocx({ deflated = false } = {}) {
  const method = deflated ? 8 : 0;
  return buildZip([
    ['word/document.xml', Buffer.from(DOCUMENT_XML, 'utf8'), method],
    ['word/numbering.xml', Buffer.from(NUMBERING_XML, 'utf8'), method],
  ]);
}

test('unzips stored and deflated entries', () => {
  for (const deflated of [false, true]) {
    const parts = unzipDocx(testDocx({ deflated }));
    assert.equal(parts.get('word/document.xml').toString('utf8'), DOCUMENT_XML);
  }
});

test('converts headings, bold, and italic', () => {
  const md = docxToMarkdown(testDocx());
  assert.match(md, /^# Process Overview$/m);
  assert.match(md, /^## Details$/m);
  assert.ok(md.includes('The **monthly close** runs on the *fifth* business day.'));
});

test('converts bullet and numbered lists from numbering.xml', () => {
  const md = docxToMarkdown(testDocx());
  assert.match(md, /^- First bullet$/m);
  assert.match(md, /^1\. First numbered$/m);
});

test('converts tables to Markdown tables', () => {
  const md = docxToMarkdown(testDocx());
  assert.ok(md.includes('| Field | Type |'));
  assert.ok(md.includes('| --- | --- |'));
  assert.ok(md.includes('| amount | number |'));
});

test('keeps hard line breaks inside a paragraph', () => {
  const md = docxToMarkdown(testDocx());
  assert.ok(md.includes('Line one  \nline two'));
});

test('rejects files that are not .docx zips', () => {
  assert.throws(() => docxToMarkdown(Buffer.from('hello')), /not a zip/);
  const noDoc = buildZip([['word/other.xml', Buffer.from('<x/>'), 0]]);
  assert.throws(() => docxToMarkdown(noDoc), /word\/document\.xml/);
});

test('resolves style-based lists through styles.xml', () => {
  // Word/python-docx style lists carry no direct w:numPr; the style does.
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>Styled bullet</w:t></w:r></w:p>` +
    `</w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:style w:styleId="ListBullet"><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr></w:style>` +
    `</w:styles>`;
  const numberingXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>` +
    `<w:num w:numId="7"><w:abstractNumId w:val="3"/></w:num></w:numbering>`;
  const docx = buildZip([
    ['word/document.xml', Buffer.from(documentXml, 'utf8'), 0],
    ['word/styles.xml', Buffer.from(stylesXml, 'utf8'), 0],
    ['word/numbering.xml', Buffer.from(numberingXml, 'utf8'), 0],
  ]);
  assert.match(docxToMarkdown(docx), /^- Styled bullet$/m);
});

test('honours explicit bold-off (w:b w:val="0")', () => {
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    `<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>plain </w:t></w:r>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r></w:p>` +
    `</w:body></w:document>`;
  const docx = buildZip([['word/document.xml', Buffer.from(documentXml, 'utf8'), 0]]);
  const md = docxToMarkdown(docx);
  assert.ok(md.includes('plain **bold**'), md);
});
