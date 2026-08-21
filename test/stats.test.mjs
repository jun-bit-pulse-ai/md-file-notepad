import test from 'node:test'
import assert from 'node:assert/strict'

import { computeStats, countWords, formatStats, toPlainText } from '../src/renderer/lib/stats.js'

test('counts plain words', () => {
  assert.equal(countWords('one two three'), 3)
  assert.equal(countWords(''), 0)
  assert.equal(countWords('   '), 0)
})

test('hyphenated and apostrophed words count once', () => {
  assert.equal(countWords("well-known can't"), 2)
})

test('code fences are excluded from prose', () => {
  const doc = ['Real words here', '', '```js', 'const a = 1', '```'].join('\n')
  assert.equal(computeStats(doc).words, 3)
})

test('inline code is excluded', () => {
  assert.equal(computeStats('Use `npm install` now').words, 2)
})

test('link labels count but URLs do not', () => {
  assert.equal(computeStats('See [the docs](https://example.com/a/b/c)').words, 3)
})

test('images do not inflate the count', () => {
  assert.equal(computeStats('![a picture of a cat](cat.png)').words, 0)
})

test('heading and list markers are stripped', () => {
  const doc = ['# Title', '- one', '- two', '1. three', '> quoted'].join('\n')
  assert.equal(computeStats(doc).words, 5)
})

test('emphasis markers do not split words', () => {
  assert.equal(computeStats('**bold** *italic* ~~struck~~ ==marked==').words, 4)
})

test('HTML tags and comments are removed', () => {
  assert.equal(computeStats('<div>inside</div><!-- hidden -->').words, 1)
})

test('table pipes and dividers are ignored', () => {
  const doc = ['| a | b |', '| --- | --- |', '| c | d |'].join('\n')
  assert.equal(computeStats(doc).words, 4)
})

test('character counts measure the raw source', () => {
  const stats = computeStats('**hi**')
  assert.equal(stats.characters, 6)
  assert.equal(stats.charactersNoSpaces, 6)
})

test('spaces are excluded from charactersNoSpaces', () => {
  assert.equal(computeStats('a b c').charactersNoSpaces, 3)
})

test('line count follows the raw document', () => {
  assert.equal(computeStats('one\ntwo\nthree').lines, 3)
  assert.equal(computeStats('').lines, 0)
})

test('a selection is measured instead of the document', () => {
  const stats = computeStats('one two three four five', 'two three')
  assert.equal(stats.words, 2)
  assert.equal(stats.isSelection, true)
})

test('reading time rounds up from zero for any prose', () => {
  assert.equal(computeStats('word').readingMinutes, 1)
  assert.equal(computeStats('').readingMinutes, 0)
})

test('reading time scales with length', () => {
  const long = Array.from({ length: 2200 }, () => 'word').join(' ')
  assert.equal(computeStats(long).readingMinutes, 10)
})

test('formatStats produces a readable summary', () => {
  const text = formatStats(computeStats('one two three'))
  assert.match(text, /3 words/)
  assert.match(text, /1 min read/)
})

test('formatStats marks selections and singular words', () => {
  assert.match(formatStats(computeStats('hello world', 'hello')), /^Selection: 1 word/)
})

test('toPlainText leaves ordinary prose alone', () => {
  assert.equal(toPlainText('Just a sentence.').trim(), 'Just a sentence.')
})
