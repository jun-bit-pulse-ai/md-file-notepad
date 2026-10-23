import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { MARKDOWN_REFERENCE, SHORTCUTS } from '../src/renderer/lib/help.js'

/** The groups the Help ▸ Keyboard Shortcuts sheet renders, in order. */
const GROUP_ORDER = ['File', 'Format', 'Blocks', 'View']

/** macOS modifier glyphs in the order Apple's HIG prints them. */
const MODIFIER_ORDER = ['⌃', '⌥', '⇧', '⌘']

/** Every `[key, label]` pair across every group, flattened. */
const allItems = SHORTCUTS.flatMap((group) =>
  group.items.map(([key, label]) => ({ group: group.group, key, label }))
)

/**
 * A key cell can name more than one chord: `⌘1 – ⌘6`, `⌘+ / ⌘-`. Splitting on
 * the separators lets the glyph checks look at one chord at a time.
 */
function chords(key) {
  return key.split(/\s*[–/]\s*/).filter(Boolean)
}

/** Collapses the cosmetic differences between the sheet and the README table. */
function normalizeKey(key) {
  return key.replace(/`/g, '').replace(/\s+/g, '')
}

/** `Open…` in a menu is `Open` in a table; compare the words, not the ellipsis. */
function normalizeLabel(label) {
  return label.replace(/…/g, '').trim().toLowerCase()
}

/**
 * The README publishes the same shortcuts as a four-column table and claims
 * parity with this sheet, so the test reads it instead of trusting a copy.
 */
function readReadmeShortcuts() {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const section = readme.split('## Keyboard shortcuts')[1]
  assert.ok(section, 'README has no "## Keyboard shortcuts" section')

  const rows = []
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) {
      if (rows.length > 0) break
      continue
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (cells.every((cell) => /^-*$/.test(cell))) continue
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const [key, label] = [cells[i], cells[i + 1]]
      if (key && label) rows.push({ key: key.replace(/`/g, ''), label })
    }
  }
  return rows
}

test('exports one entry per group in the order the sheet renders them', () => {
  assert.deepEqual(
    SHORTCUTS.map((group) => group.group),
    GROUP_ORDER
  )
})

test('gives every group a non-empty name and at least one shortcut', () => {
  for (const group of SHORTCUTS) {
    assert.equal(typeof group.group, 'string')
    assert.ok(group.group.trim().length > 0, 'group name is blank')
    assert.ok(Array.isArray(group.items), `${group.group} has no items array`)
    assert.ok(group.items.length > 0, `${group.group} is empty`)
  }
})

test('states every shortcut as a key and a label, with neither blank', () => {
  for (const group of SHORTCUTS) {
    for (const item of group.items) {
      assert.equal(item.length, 2, `${group.group}: expected a [key, label] pair`)
      const [key, label] = item
      assert.equal(typeof key, 'string')
      assert.equal(typeof label, 'string')
      assert.ok(key.trim().length > 0, `${group.group}: a key is blank`)
      assert.ok(label.trim().length > 0, `${group.group}: "${key}" has no label`)
    }
  }
})

test('never claims the same key combination for two commands', () => {
  const seen = new Map()
  for (const { key, label } of allItems) {
    for (const chord of chords(key)) {
      const previous = seen.get(chord)
      assert.equal(
        previous,
        undefined,
        `${chord} is claimed by both "${previous}" and "${label}"`
      )
      seen.set(chord, label)
    }
  }
})

test('never lists the same command twice', () => {
  const seen = new Set()
  for (const { label } of allItems) {
    assert.ok(!seen.has(label), `"${label}" is listed more than once`)
    seen.add(label)
  }
})

test('writes modifiers as macOS glyphs, never as spelled-out names', () => {
  for (const { key, label } of allItems) {
    assert.doesNotMatch(
      key,
      /cmd|command|ctrl|control|shift|alt|opt|option|meta|\+(?=[A-Za-z])/i,
      `"${label}" spells its modifiers out: ${key}`
    )
  }
})

test('gives every shortcut at least one modifier glyph', () => {
  for (const { key, label } of allItems) {
    for (const chord of chords(key)) {
      assert.ok(
        MODIFIER_ORDER.some((glyph) => chord.includes(glyph)),
        `"${label}" has no modifier: ${chord}`
      )
    }
  }
})

test('prints modifier glyphs in the canonical ⌃⌥⇧⌘ order', () => {
  for (const { key, label } of allItems) {
    for (const chord of chords(key)) {
      const positions = [...chord]
        .map((char) => MODIFIER_ORDER.indexOf(char))
        .filter((index) => index !== -1)
      assert.deepEqual(
        positions,
        [...positions].sort((a, b) => a - b),
        `"${label}" orders its modifiers unconventionally: ${chord}`
      )
    }
  }
})

test('ends every chord with ⌘, the modifier every command shares', () => {
  for (const { key, label } of allItems) {
    for (const chord of chords(key)) {
      const glyphs = [...chord].filter((char) => MODIFIER_ORDER.includes(char))
      assert.equal(glyphs.at(-1), '⌘', `"${label}" is not a ⌘ shortcut: ${chord}`)
    }
  }
})

test('labels are trimmed, sentence-cased and free of trailing punctuation', () => {
  for (const { label } of allItems) {
    assert.equal(label, label.trim(), `"${label}" has surrounding whitespace`)
    assert.match(label[0], /[A-Z]/, `"${label}" does not start with a capital`)
    assert.doesNotMatch(label, /[.:;]$/, `"${label}" ends in punctuation`)
  }
})

test('keeps the File group ordered new, open, save, reveal', () => {
  const file = SHORTCUTS.find((group) => group.group === 'File')
  assert.deepEqual(
    file.items.map(([, label]) => label),
    ['New document', 'Open…', 'Quick Open', 'Save', 'Save As…', 'Reveal in Finder']
  )
})

test('every shortcut the sheet lists also appears in the README table', () => {
  const readme = readReadmeShortcuts()
  const published = new Map(
    readme.map((row) => [normalizeKey(row.key), normalizeLabel(row.label)])
  )

  for (const { key, label } of allItems) {
    const documented = published.get(normalizeKey(key))
    assert.notEqual(documented, undefined, `${key} ("${label}") is not in the README`)
    assert.equal(
      documented,
      normalizeLabel(label),
      `${key} is "${label}" in the sheet but "${documented}" in the README`
    )
  }
})

/**
 * KNOWN DRIFT. The README table and `src/main/menu.js` both carry three Edit
 * menu shortcuts that the Help sheet omits, and the README states "the same
 * list is available in the app under Help ▸ Keyboard Shortcuts" — so the sheet
 * is the side that is short. This test pins the gap exactly rather than hiding
 * it: close it by adding the three to `SHORTCUTS` (or by deciding the README
 * should drop them) and then delete this test.
 */
test('is missing exactly the three Edit shortcuts the README still lists', () => {
  const listed = new Set(allItems.map(({ key }) => normalizeKey(key)))
  const missing = readReadmeShortcuts()
    .filter((row) => !listed.has(normalizeKey(row.key)))
    .map((row) => `${row.key} ${row.label}`)

  assert.deepEqual(missing, [
    '⌥⌘F Find and replace',
    '⇧⌘V Paste as plain text',
    '⇧⌘C Copy as Markdown',
  ])
})

test('ships a Markdown reference that demonstrates every rendered construct', () => {
  assert.equal(typeof MARKDOWN_REFERENCE, 'string')
  for (const construct of [
    '**bold**',
    '*italic*',
    '~~struck through~~',
    '==highlighted==',
    '- [ ] ',
    '- [x] ',
    '```javascript',
    '$E = mc^2$',
    '![A placeholder]',
  ]) {
    assert.ok(
      MARKDOWN_REFERENCE.includes(construct),
      `the reference never shows ${construct}`
    )
  }
})

test('starts the Markdown reference with a single top-level heading', () => {
  const headings = MARKDOWN_REFERENCE.split('\n').filter((line) => line.startsWith('# '))
  assert.deepEqual(headings, ['# Welcome'])
})
