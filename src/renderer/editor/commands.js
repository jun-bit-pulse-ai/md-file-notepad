import { EditorSelection } from '@codemirror/state'

/**
 * Markdown editing commands. All of them are range-aware: they operate on
 * every cursor/selection, and toggling is symmetric (running the same
 * command twice returns the original text).
 */

/** Expands an empty cursor to the word under it, so ⌘B alone bolds a word. */
function rangeOrWord(state, range) {
  if (!range.empty) return range
  const line = state.doc.lineAt(range.head)
  const offset = range.head - line.from
  const before = /[\p{L}\p{N}_'-]*$/u.exec(line.text.slice(0, offset))[0]
  const after = /^[\p{L}\p{N}_'-]*/u.exec(line.text.slice(offset))[0]
  if (!before && !after) return range
  return EditorSelection.range(range.head - before.length, range.head + after.length)
}

/**
 * Wraps (or unwraps) each selection in `marker`.
 * `**bold**` -> `bold` when already wrapped, including when the markers sit
 * just outside the selection.
 */
function toggleWrap(marker, altMarker = marker) {
  return (view) => {
    const { state } = view

    // changeByRange composes each range's edits and maps the resulting
    // selections through the *other* ranges' changes, which hand-computed
    // offsets get wrong the moment there is more than one cursor.
    const spec = state.changeByRange((raw) => {
      const range = rangeOrWord(state, raw)
      const text = state.doc.sliceString(range.from, range.to)
      const len = marker.length

      const outerBefore = state.doc.sliceString(Math.max(0, range.from - len), range.from)
      const outerAfter = state.doc.sliceString(
        range.to,
        Math.min(state.doc.length, range.to + len)
      )

      const wrappedInside =
        text.length >= len * 2 && text.startsWith(marker) && text.endsWith(marker)
      const wrappedOutside = outerBefore === marker && outerAfter === marker

      if (wrappedInside) {
        return {
          changes: [
            { from: range.from, to: range.from + len },
            { from: range.to - len, to: range.to },
          ],
          range: EditorSelection.range(range.from, range.to - len * 2),
        }
      }

      if (wrappedOutside) {
        return {
          changes: [
            { from: range.from - len, to: range.from },
            { from: range.to, to: range.to + len },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        }
      }

      // Fall back to the alternate marker when the text already contains
      // the primary one (`**a * b**` would otherwise parse wrong).
      const use = text.includes(marker) ? altMarker : marker
      return {
        changes: [
          { from: range.from, insert: use },
          { from: range.to, insert: use },
        ],
        range:
          raw.empty && !text
            ? EditorSelection.cursor(range.from + use.length)
            : EditorSelection.range(range.from + use.length, range.to + use.length),
      }
    })

    view.dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }))
    return true
  }
}

/** Applies a transform to every line touched by the selection. */
function mapSelectedLines(view, transform) {
  const { state } = view
  const changes = []
  const seen = new Set()

  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number
    const endLine = state.doc.lineAt(range.to).number
    for (let n = startLine; n <= endLine; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      const line = state.doc.line(n)
      const next = transform(line.text, n - startLine, line)
      if (next !== null && next !== line.text) {
        changes.push({ from: line.from, to: line.to, insert: next })
      }
    }
  }

  if (!changes.length) return false
  view.dispatch(
    state.update({ changes, scrollIntoView: true, userEvent: 'input.format' })
  )
  return true
}

const HEADING_PREFIX = /^(\s*)(#{1,6})\s+/
const BULLET_PREFIX = /^(\s*)([-*+])\s+/
const ORDERED_PREFIX = /^(\s*)(\d+)([.)])\s+/
const TASK_PREFIX = /^(\s*)([-*+])\s+\[([ xX])\]\s+/
const QUOTE_PREFIX = /^(\s*)>\s?/

/** ⌘1-⌘6; running the same level again drops back to a paragraph. */
function setHeading(level) {
  return (view) =>
    mapSelectedLines(view, (text) => {
      const current = HEADING_PREFIX.exec(text)
      const body = current ? text.slice(current[0].length) : text.replace(/^\s+/, '')
      const indent = current ? current[1] : /^\s*/.exec(text)[0]
      if (current && current[2].length === level) return `${indent}${body}`
      if (level === 0) return `${indent}${body}`
      return `${indent}${'#'.repeat(level)} ${body}`
    })
}

function toggleBulletList(view) {
  const { state } = view
  const allBullets = selectedLines(state).every(
    (line) => !line.text.trim() || BULLET_PREFIX.test(line.text)
  )
  return mapSelectedLines(view, (text) => {
    if (!text.trim()) return text
    if (allBullets) return text.replace(BULLET_PREFIX, '$1')
    const stripped = stripListMarkers(text)
    const indent = /^\s*/.exec(text)[0]
    return `${indent}- ${stripped}`
  })
}

function toggleOrderedList(view) {
  const { state } = view
  const allOrdered = selectedLines(state).every(
    (line) => !line.text.trim() || ORDERED_PREFIX.test(line.text)
  )
  let counter = 0
  return mapSelectedLines(view, (text) => {
    if (!text.trim()) return text
    if (allOrdered) return text.replace(ORDERED_PREFIX, '$1')
    counter += 1
    const stripped = stripListMarkers(text)
    const indent = /^\s*/.exec(text)[0]
    return `${indent}${counter}. ${stripped}`
  })
}

function toggleTaskList(view) {
  const { state } = view
  const allTasks = selectedLines(state).every(
    (line) => !line.text.trim() || TASK_PREFIX.test(line.text)
  )
  return mapSelectedLines(view, (text) => {
    if (!text.trim()) return text
    if (allTasks) return text.replace(TASK_PREFIX, '$1')
    const stripped = stripListMarkers(text)
    const indent = /^\s*/.exec(text)[0]
    return `${indent}- [ ] ${stripped}`
  })
}

/** ⌘⇧D — flips `[ ]` and `[x]` on every touched task line. */
function toggleTaskDone(view) {
  return mapSelectedLines(view, (text) => {
    const match = TASK_PREFIX.exec(text)
    if (!match) return text
    const checked = match[3].toLowerCase() === 'x'
    return text.replace(/\[([ xX])\]/, checked ? '[ ]' : '[x]')
  })
}

function toggleQuote(view) {
  const { state } = view
  const allQuoted = selectedLines(state).every(
    (line) => !line.text.trim() || QUOTE_PREFIX.test(line.text)
  )
  return mapSelectedLines(view, (text) => {
    if (!text.trim()) return text
    if (allQuoted) return text.replace(QUOTE_PREFIX, '$1')
    return `> ${text}`
  })
}

function stripListMarkers(text) {
  return text
    .replace(TASK_PREFIX, '')
    .replace(BULLET_PREFIX, '')
    .replace(ORDERED_PREFIX, '')
    .replace(/^\s+/, '')
}

function selectedLines(state) {
  const lines = []
  const seen = new Set()
  for (const range of state.selection.ranges) {
    const start = state.doc.lineAt(range.from).number
    const end = state.doc.lineAt(range.to).number
    for (let n = start; n <= end; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      lines.push(state.doc.line(n))
    }
  }
  return lines
}

/** Inserts a block at the cursor, ensuring it starts on its own line. */
function insertBlock(view, text, cursorOffset = null) {
  const { state } = view
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)
  const needsLeadingBreak = line.text.trim().length > 0
  const prefix = needsLeadingBreak ? '\n\n' : ''
  const insert = `${prefix}${text}`
  const at = needsLeadingBreak ? line.to : line.from

  view.dispatch(
    state.update({
      changes: { from: at, to: Math.max(at, range.to), insert },
      selection: {
        anchor:
          at + (cursorOffset === null ? insert.length : prefix.length + cursorOffset),
      },
      scrollIntoView: true,
      userEvent: 'input.format',
    })
  )
  return true
}

function insertLink(view, url = '') {
  const { state } = view

  const spec = state.changeByRange((range) => {
    const text = state.doc.sliceString(range.from, range.to)
    const label = text || 'link text'
    const insert = `[${label}](${url})`
    return {
      changes: { from: range.from, to: range.to, insert },
      // Park the cursor wherever the user still has to type: the URL slot
      // when there's already a label, the label otherwise.
      range:
        text && !url
          ? EditorSelection.cursor(range.from + insert.length - 1)
          : EditorSelection.range(range.from + 1, range.from + 1 + label.length),
    }
  })

  view.dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }))
  return true
}

function insertImage(view, src = '') {
  const { state } = view
  const range = state.selection.main
  const alt = state.doc.sliceString(range.from, range.to) || 'alt text'
  const insert = `![${alt}](${src})`
  view.dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + insert.length - 1 },
      scrollIntoView: true,
      userEvent: 'input.format',
    })
  )
  return true
}

function insertTable(view, rows = 3, cols = 3) {
  const header = `| ${Array.from({ length: cols }, (_, i) => `Column ${i + 1}`).join(' | ')} |`
  const divider = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`
  const body = Array.from(
    { length: Math.max(1, rows - 1) },
    () => `| ${Array.from({ length: cols }, () => '   ').join(' | ')} |`
  ).join('\n')
  return insertBlock(view, `${header}\n${divider}\n${body}\n`, 2)
}

function insertCodeBlock(view, language = '') {
  const { state } = view
  const range = state.selection.main
  const selected = state.doc.sliceString(range.from, range.to)
  const body = selected || ''
  return insertBlock(
    view,
    '```' + language + '\n' + body + '\n```\n',
    3 + language.length
  )
}

function insertHorizontalRule(view) {
  return insertBlock(view, '---\n')
}

/**
 * Enter inside a list continues it; Enter on an empty item ends the list.
 * This is the single biggest quality-of-life difference between "a text
 * box" and "a markdown editor".
 */
function continueList(view) {
  const { state } = view
  const range = state.selection.main
  if (!range.empty) return false
  const line = state.doc.lineAt(range.head)
  const text = line.text

  const task = TASK_PREFIX.exec(text)
  const bullet = BULLET_PREFIX.exec(text)
  const ordered = ORDERED_PREFIX.exec(text)
  const quote = QUOTE_PREFIX.exec(text)
  if (!task && !bullet && !ordered && !quote) return false

  const marker = task ? task[0] : bullet ? bullet[0] : ordered ? ordered[0] : quote[0]
  const body = text.slice(marker.length)

  // Empty item: outdent it away rather than adding another empty bullet.
  if (!body.trim() && range.head === line.to) {
    view.dispatch(
      state.update({
        changes: { from: line.from, to: line.to, insert: '' },
        userEvent: 'input',
      })
    )
    return true
  }

  let nextMarker = marker
  if (ordered) {
    const n = Number(ordered[2]) + 1
    nextMarker = `${ordered[1]}${n}${ordered[3]} `
  } else if (task) {
    nextMarker = `${task[1]}${task[2]} [ ] `
  }

  view.dispatch(
    state.update({
      changes: { from: range.head, to: range.head, insert: `\n${nextMarker}` },
      selection: { anchor: range.head + 1 + nextMarker.length },
      scrollIntoView: true,
      userEvent: 'input',
    })
  )
  return true
}

const toggleBold = toggleWrap('**', '__')
const toggleItalic = toggleWrap('*', '_')
const toggleInlineCode = toggleWrap('`')
const toggleStrikethrough = toggleWrap('~~')
const toggleHighlight = toggleWrap('==')

export {
  continueList,
  insertCodeBlock,
  insertHorizontalRule,
  insertImage,
  insertLink,
  insertTable,
  mapSelectedLines,
  setHeading,
  toggleBold,
  toggleBulletList,
  toggleHighlight,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleQuote,
  toggleStrikethrough,
  toggleTaskDone,
  toggleTaskList,
  toggleWrap,
}
