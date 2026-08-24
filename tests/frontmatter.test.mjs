import assert from 'node:assert/strict';
import test from 'node:test';
import { FrontmatterError, parseYaml, readFrontmatter, splitFrontmatter } from '../scripts/lib/frontmatter.mjs';

test('splits frontmatter from body', () => {
  const { frontmatter, body } = splitFrontmatter('---\nname: a\n---\n# Title\n');
  assert.equal(frontmatter, 'name: a');
  assert.equal(body, '# Title\n');
});

test('reports no frontmatter when the file does not open with ---', () => {
  assert.equal(splitFrontmatter('# Title').frontmatter, null);
});

test('throws when frontmatter is never closed', () => {
  assert.throws(() => splitFrontmatter('---\nname: a\n# Title'), FrontmatterError);
});

test('parses scalars, folded block scalars, sequences and nested maps', () => {
  const data = parseYaml(
    ['name: demo-skill', 'description: >-', '  one', '  two', 'allowed-tools:', '  - Read', '  - Bash', 'metadata:', '  version: 3'].join('\n'),
  );
  assert.equal(data.name, 'demo-skill');
  assert.equal(data.description, 'one two');
  assert.deepEqual(data['allowed-tools'], ['Read', 'Bash']);
  assert.deepEqual(data.metadata, { version: 3 });
});

test('keeps line breaks in literal block scalars', () => {
  const data = parseYaml(['body: |-', '  line one', '  line two'].join('\n'));
  assert.equal(data.body, 'line one\nline two');
});

test('strips surrounding quotes and coerces booleans', () => {
  const data = parseYaml(['a: "quoted, value"', 'b: true'].join('\n'));
  assert.equal(data.a, 'quoted, value');
  assert.equal(data.b, true);
});

test('rejects a line it cannot parse', () => {
  assert.throws(() => parseYaml('not a mapping'), FrontmatterError);
});

test('readFrontmatter returns data and body together', () => {
  const { data, body } = readFrontmatter('---\nname: a\n---\nbody text');
  assert.equal(data.name, 'a');
  assert.equal(body, 'body text');
});
