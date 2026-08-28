import test from 'node:test'
import assert from 'node:assert/strict'

import { fuzzyMatch, highlightSegments, rankItems } from '../src/renderer/lib/fuzzy.js'

const best = (query, items) => {
  const ranked = rankItems(query, items)
  return ranked.length ? ranked[0].key : null
}

/* -------------------------------- matching ------------------------------- */

test('matches a contiguous substring', () => {
  const match = fuzzyMatch('note', 'notes.md')
  assert.ok(match)
  assert.deepEqual(match.positions, [0, 1, 2, 3])
})

test('matches a non-contiguous subsequence', () => {
  const match = fuzzyMatch('nmd', 'notes.md')
  assert.ok(match)
  assert.deepEqual(match.positions, [0, 6, 7])
})

test('returns null when characters are out of order', () => {
  assert.equal(fuzzyMatch('dmn', 'notes.md'), null)
})

test('returns null when a character is missing', () => {
  assert.equal(fuzzyMatch('xyz', 'notes.md'), null)
})

test('matching is case-insensitive', () => {
  assert.ok(fuzzyMatch('README', 'readme.md'))
  assert.ok(fuzzyMatch('readme', 'README.md'))
})

test('an empty query matches anything with no positions', () => {
  const match = fuzzyMatch('', 'anything.md')
  assert.deepEqual(match, { score: 0, positions: [] })
})

test('spaces in the query are ignored', () => {
  assert.ok(fuzzyMatch('li pre', 'livePreview.js'))
})

test('non-string targets do not throw', () => {
  assert.equal(fuzzyMatch('a', undefined), null)
  assert.equal(fuzzyMatch('a', null), null)
})

/* -------------------------------- scoring -------------------------------- */

test('consecutive matches outrank scattered ones', () => {
  const contiguous = fuzzyMatch('note', 'note.md').score
  const scattered = fuzzyMatch('note', 'n-o-t-e.md').score
  assert.ok(contiguous > scattered, `${contiguous} should beat ${scattered}`)
})

test('a filename match beats a directory match', () => {
  assert.equal(best('report', ['report/index.md', 'docs/report.md']), 'docs/report.md')
})

test('word starts are preferred over mid-word hits', () => {
  assert.equal(best('lp', ['src/livePreview.js', 'src/helpers.js']), 'src/livePreview.js')
})

test('camelCase humps count as word starts', () => {
  const match = fuzzyMatch('lp', 'livePreview.js')
  const mid = fuzzyMatch('lp', 'lamp.js')
  assert.ok(match.score > mid.score)
})

test('an exact prefix of the filename wins', () => {
  assert.equal(best('menu', ['src/main/menu.js', 'src/submenu-helper.js']), 'src/main/menu.js')
})

test('shorter paths win when otherwise equal', () => {
  assert.equal(best('a.md', ['a.md', 'very/deep/nested/folder/a.md']), 'a.md')
})

test('one long gap does not sink an otherwise good match', () => {
  const match = fuzzyMatch('ab', 'a' + 'x'.repeat(60) + 'b')
  assert.ok(match)
  assert.ok(match.score > -20, `score ${match.score} should stay bounded`)
})

/* -------------------------------- ranking -------------------------------- */

test('rankItems returns best-first and drops non-matches', () => {
  const items = ['alpha.md', 'beta.md', 'alphabet.md']
  const ranked = rankItems('alpha', items)
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].key, 'alpha.md')
})

test('rankItems supports a key function over objects', () => {
  const items = [{ relativePath: 'docs/notes.md' }, { relativePath: 'src/main.js' }]
  const ranked = rankItems('notes', items, (item) => item.relativePath)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].item.relativePath, 'docs/notes.md')
})

test('an empty query keeps every item', () => {
  const items = ['a.md', 'b.md', 'c.md']
  assert.equal(rankItems('', items).length, 3)
})

test('ranking is stable for equal scores', () => {
  const items = ['b.md', 'a.md']
  const first = rankItems('md', items).map((r) => r.key)
  const second = rankItems('md', [...items].reverse()).map((r) => r.key)
  assert.deepEqual(first, second)
})

test('rankItems tolerates missing input', () => {
  assert.deepEqual(rankItems('x', null), [])
  assert.deepEqual(rankItems('x', []), [])
})

/* ------------------------------ highlighting ----------------------------- */

test('highlightSegments marks the matched characters', () => {
  const segments = highlightSegments('notes.md', [0, 1, 2, 3])
  assert.deepEqual(segments, [
    { text: 'note', matched: true },
    { text: 's.md', matched: false },
  ])
})

test('highlightSegments merges adjacent runs', () => {
  const segments = highlightSegments('abcdef', [0, 1, 4, 5])
  assert.deepEqual(segments, [
    { text: 'ab', matched: true },
    { text: 'cd', matched: false },
    { text: 'ef', matched: true },
  ])
})

test('highlightSegments round-trips the original text', () => {
  const text = 'src/renderer/livePreview.js'
  const { positions } = fuzzyMatch('lp', text)
  const joined = highlightSegments(text, positions)
    .map((s) => s.text)
    .join('')
  assert.equal(joined, text)
})

test('highlightSegments with no positions returns one plain segment', () => {
  assert.deepEqual(highlightSegments('abc', []), [{ text: 'abc', matched: false }])
})
