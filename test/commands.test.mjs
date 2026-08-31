import test from 'node:test'
import assert from 'node:assert/strict'

import { EditorState, EditorSelection } from '@codemirror/state'

import {
  continueList,
  insertLink,
  insertTable,
  setHeading,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleQuote,
  toggleTaskDone,
  toggleTaskList,
} from '../src/renderer/editor/commands.js'

/**
 * The formatting commands only touch EditorState, never the DOM, so a
 * two-line stand-in for EditorView is enough to test them for real.
 */
function makeView(doc, selection) {
  const view = {
    state: EditorState.create({
      doc,
      selection,
      // Mirrors the real editor; without it multi-range selections collapse.
      extensions: EditorState.allowMultipleSelections.of(true),
    }),
    dispatch(transaction) {
      this.state = transaction.state
    },
  }
  return view
}

const cursorAt = (pos) => EditorSelection.cursor(pos)
const rangeOf = (from, to) => EditorSelection.range(from, to)

test('bold wraps a selection', () => {
  const view = makeView('hello world', rangeOf(0, 5))
  toggleBold(view)
  assert.equal(view.state.doc.toString(), '**hello** world')
})

test('bold unwraps an already-bold selection', () => {
  const view = makeView('**hello** world', rangeOf(0, 9))
  toggleBold(view)
  assert.equal(view.state.doc.toString(), 'hello world')
})

test('bold unwraps when the markers sit outside the selection', () => {
  const view = makeView('**hello** world', rangeOf(2, 7))
  toggleBold(view)
  assert.equal(view.state.doc.toString(), 'hello world')
})

test('bold with a bare cursor wraps the surrounding word', () => {
  const view = makeView('hello world', cursorAt(3))
  toggleBold(view)
  assert.equal(view.state.doc.toString(), '**hello** world')
})

test('bold on empty space inserts markers and parks the cursor between them', () => {
  const view = makeView('', cursorAt(0))
  toggleBold(view)
  assert.equal(view.state.doc.toString(), '****')
  assert.equal(view.state.selection.main.head, 2)
})

test('italic round-trips', () => {
  const view = makeView('word', rangeOf(0, 4))
  toggleItalic(view)
  assert.equal(view.state.doc.toString(), '*word*')
  toggleItalic(view)
  assert.equal(view.state.doc.toString(), 'word')
})

test('inline code round-trips', () => {
  const view = makeView('npm test', rangeOf(0, 8))
  toggleInlineCode(view)
  assert.equal(view.state.doc.toString(), '`npm test`')
  toggleInlineCode(view)
  assert.equal(view.state.doc.toString(), 'npm test')
})

test('bold applies to every cursor in a multi-selection', () => {
  const view = makeView('one two', EditorSelection.create([rangeOf(0, 3), rangeOf(4, 7)]))
  toggleBold(view)
  assert.equal(view.state.doc.toString(), '**one** **two**')
})

test('setHeading adds a level', () => {
  const view = makeView('Title', cursorAt(0))
  setHeading(2)(view)
  assert.equal(view.state.doc.toString(), '## Title')
})

test('setHeading replaces an existing level', () => {
  const view = makeView('### Title', cursorAt(0))
  setHeading(1)(view)
  assert.equal(view.state.doc.toString(), '# Title')
})

test('setHeading at the same level toggles back to a paragraph', () => {
  const view = makeView('## Title', cursorAt(0))
  setHeading(2)(view)
  assert.equal(view.state.doc.toString(), 'Title')
})

test('setHeading(0) always clears the heading', () => {
  const view = makeView('###### Deep', cursorAt(0))
  setHeading(0)(view)
  assert.equal(view.state.doc.toString(), 'Deep')
})

test('setHeading applies to every selected line', () => {
  const view = makeView('one\ntwo', rangeOf(0, 7))
  setHeading(3)(view)
  assert.equal(view.state.doc.toString(), '### one\n### two')
})

test('bullet list toggles on and off', () => {
  const view = makeView('one\ntwo', rangeOf(0, 7))
  toggleBulletList(view)
  assert.equal(view.state.doc.toString(), '- one\n- two')
  toggleBulletList(view)
  assert.equal(view.state.doc.toString(), 'one\ntwo')
})

test('ordered list numbers sequentially', () => {
  const view = makeView('a\nb\nc', rangeOf(0, 5))
  toggleOrderedList(view)
  assert.equal(view.state.doc.toString(), '1. a\n2. b\n3. c')
})

test('switching between list types replaces the marker', () => {
  const view = makeView('- one', cursorAt(0))
  toggleOrderedList(view)
  assert.equal(view.state.doc.toString(), '1. one')
})

test('task list toggles on and off', () => {
  const view = makeView('do it', cursorAt(0))
  toggleTaskList(view)
  assert.equal(view.state.doc.toString(), '- [ ] do it')
  toggleTaskList(view)
  assert.equal(view.state.doc.toString(), 'do it')
})

test('toggleTaskDone flips the checkbox both ways', () => {
  const view = makeView('- [ ] task', cursorAt(0))
  toggleTaskDone(view)
  assert.equal(view.state.doc.toString(), '- [x] task')
  toggleTaskDone(view)
  assert.equal(view.state.doc.toString(), '- [ ] task')
})

test('blockquote toggles on and off', () => {
  const view = makeView('quoted', cursorAt(0))
  toggleQuote(view)
  assert.equal(view.state.doc.toString(), '> quoted')
  toggleQuote(view)
  assert.equal(view.state.doc.toString(), 'quoted')
})

test('Enter continues a bullet list', () => {
  const view = makeView('- one', cursorAt(5))
  assert.equal(continueList(view), true)
  assert.equal(view.state.doc.toString(), '- one\n- ')
})

test('Enter increments an ordered list', () => {
  const view = makeView('3. three', cursorAt(8))
  continueList(view)
  assert.equal(view.state.doc.toString(), '3. three\n4. ')
})

test('Enter continues a task list with an unchecked box', () => {
  const view = makeView('- [x] done', cursorAt(10))
  continueList(view)
  assert.equal(view.state.doc.toString(), '- [x] done\n- [ ] ')
})

test('Enter on an empty list item ends the list', () => {
  const view = makeView('- one\n- ', cursorAt(8))
  assert.equal(continueList(view), true)
  assert.equal(view.state.doc.toString(), '- one\n')
})

test('Enter outside a list is left to the default handler', () => {
  const view = makeView('plain text', cursorAt(10))
  assert.equal(continueList(view), false)
})

test('Enter preserves indentation of nested items', () => {
  const view = makeView('  - nested', cursorAt(10))
  continueList(view)
  assert.equal(view.state.doc.toString(), '  - nested\n  - ')
})

test('insertLink wraps the selection as the label', () => {
  const view = makeView('click here', rangeOf(0, 10))
  insertLink(view)
  assert.equal(view.state.doc.toString(), '[click here]()')
})

test('insertTable emits a well-formed GFM table', () => {
  const view = makeView('', cursorAt(0))
  insertTable(view, 3, 2)
  const lines = view.state.doc.toString().trim().split('\n')
  assert.equal(lines[0], '| Column 1 | Column 2 |')
  assert.equal(lines[1], '| --- | --- |')
  assert.equal(lines.length, 4)
})

test('a block insert on a non-empty line starts a new paragraph', () => {
  const view = makeView('existing text', cursorAt(13))
  insertTable(view, 2, 1)
  assert.match(view.state.doc.toString(), /^existing text\n\n\| Column 1 \|/)
})
