import test from 'node:test'
import assert from 'node:assert/strict'

import {
  activeHeadingIndex,
  extractOutline,
  slugify,
  stripInline,
  toTree,
} from '../src/renderer/lib/outline.js'

test('extracts ATX headings with levels and 1-based line numbers', () => {
  const doc = ['# Title', '', 'text', '## Section', '### Sub'].join('\n')
  const outline = extractOutline(doc)

  assert.equal(outline.length, 3)
  assert.deepEqual(
    outline.map((h) => [h.level, h.text, h.line]),
    [
      [1, 'Title', 1],
      [2, 'Section', 4],
      [3, 'Sub', 5],
    ]
  )
})

test('offsets point at the start of the heading line', () => {
  const doc = '# One\n\n## Two'
  const outline = extractOutline(doc)
  assert.equal(doc.slice(outline[0].from, outline[0].from + 5), '# One')
  assert.equal(doc.slice(outline[1].from, outline[1].from + 6), '## Two')
})

test('ignores # inside fenced code blocks', () => {
  const doc = ['# Real', '', '```bash', '# not a heading', 'echo hi', '```', '', '## Also real'].join(
    '\n'
  )
  const outline = extractOutline(doc)
  assert.deepEqual(
    outline.map((h) => h.text),
    ['Real', 'Also real']
  )
})

test('a fence only closes on a matching marker of at least equal length', () => {
  const doc = ['````', '```', '# still code', '````', '# heading'].join('\n')
  assert.deepEqual(
    extractOutline(doc).map((h) => h.text),
    ['heading']
  )
})

test('handles tilde fences', () => {
  const doc = ['~~~', '# hidden', '~~~', '# shown'].join('\n')
  assert.deepEqual(
    extractOutline(doc).map((h) => h.text),
    ['shown']
  )
})

test('supports setext headings', () => {
  const doc = ['Title', '=====', '', 'Section', '-------'].join('\n')
  const outline = extractOutline(doc)
  assert.deepEqual(
    outline.map((h) => [h.level, h.text]),
    [
      [1, 'Title'],
      [2, 'Section'],
    ]
  )
})

test('a list item followed by dashes is not a setext heading', () => {
  const doc = ['- item', '---'].join('\n')
  assert.deepEqual(extractOutline(doc), [])
})

test('strips inline markup from heading text', () => {
  const outline = extractOutline('# A **bold** and `code` [link](http://x.com) title')
  assert.equal(outline[0].text, 'A bold and code link title')
})

test('drops trailing closing hashes', () => {
  assert.equal(extractOutline('## Section ##')[0].text, 'Section')
})

test('ignores headings with no text', () => {
  const outline = extractOutline('#\n##   \n# Real')
  assert.deepEqual(
    outline.map((h) => h.text),
    ['Real']
  )
})

test('slugs are unique within a document', () => {
  const outline = extractOutline('# Setup\n## Setup\n### Setup')
  assert.deepEqual(
    outline.map((h) => h.slug),
    ['setup', 'setup-1', 'setup-2']
  )
})

test('slugify matches common anchor conventions', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world')
  assert.equal(slugify('  Spaced   Out  '), 'spaced-out')
  assert.equal(slugify('Ünïcode Tïtle'), 'ünïcode-tïtle')
})

test('stripInline removes emphasis without eating inner text', () => {
  assert.equal(stripInline('***very*** ~~old~~ ==new=='), 'very old new')
})

test('toTree nests headings and tolerates skipped levels', () => {
  const tree = toTree(extractOutline('# A\n### B\n## C\n# D'))
  assert.equal(tree.length, 2)
  assert.equal(tree[0].text, 'A')
  assert.deepEqual(
    tree[0].children.map((c) => c.text),
    ['B', 'C']
  )
  assert.equal(tree[1].text, 'D')
})

test('activeHeadingIndex finds the heading containing a line', () => {
  const outline = extractOutline('# A\n\ntext\n\n## B\n\nmore')
  assert.equal(activeHeadingIndex(outline, 1), 0)
  assert.equal(activeHeadingIndex(outline, 3), 0)
  assert.equal(activeHeadingIndex(outline, 5), 1)
  assert.equal(activeHeadingIndex(outline, 7), 1)
})

test('activeHeadingIndex returns -1 above the first heading', () => {
  assert.equal(activeHeadingIndex(extractOutline('intro\n\n# A'), 1), -1)
})

test('empty and missing documents produce no headings', () => {
  assert.deepEqual(extractOutline(''), [])
  assert.deepEqual(extractOutline(undefined), [])
})
