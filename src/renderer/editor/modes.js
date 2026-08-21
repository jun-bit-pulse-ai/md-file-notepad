import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import { StateEffect, StateField } from '@codemirror/state'

/**
 * Focus mode and typewriter mode.
 *
 * Focus mode dims every block except the one being edited; typewriter mode
 * keeps the caret pinned near the vertical centre of the window.
 */

const setModes = StateEffect.define()

const modeState = StateField.define({
  create: () => ({ focusMode: false, typewriterMode: false }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setModes)) return { ...value, ...effect.value }
    }
    return value
  },
})

const dimmed = Decoration.line({ class: 'cm-dimmed' })

/** Finds the blank-line-delimited paragraph containing `pos`. */
function paragraphBounds(doc, pos) {
  const line = doc.lineAt(pos)
  let start = line.number
  let end = line.number
  while (start > 1 && doc.line(start - 1).text.trim() !== '') start--
  while (end < doc.lines && doc.line(end + 1).text.trim() !== '') end++
  return { start, end }
}

const focusModePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view)
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.build(update.view)
      }
    }

    build(view) {
      const { focusMode } = view.state.field(modeState, false) || {}
      if (!focusMode) return Decoration.none

      const { doc } = view.state
      const active = new Set()
      for (const range of view.state.selection.ranges) {
        const from = paragraphBounds(doc, range.from)
        const to = paragraphBounds(doc, range.to)
        for (let n = from.start; n <= to.end; n++) active.add(n)
      }

      const decorations = []
      for (const { from, to } of view.visibleRanges) {
        let pos = from
        while (pos <= to) {
          const line = doc.lineAt(pos)
          if (!active.has(line.number)) decorations.push(dimmed.range(line.from))
          pos = line.to + 1
        }
      }
      return Decoration.set(decorations, true)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/**
 * Typewriter scrolling. Only re-centres on caret movement or edits, never
 * on plain scrolling, so the user can still look around freely.
 */
const typewriterPlugin = EditorView.updateListener.of((update) => {
  const { typewriterMode } = update.state.field(modeState, false) || {}
  if (!typewriterMode) return
  if (!update.docChanged && !update.selectionSet) return

  const head = update.state.selection.main.head
  requestAnimationFrame(() => {
    if (update.view.destroyed) return
    update.view.dispatch({
      effects: EditorView.scrollIntoView(head, { y: 'center' }),
    })
  })
})

function editorModes() {
  return [modeState, focusModePlugin, typewriterPlugin]
}

export { editorModes, modeState, paragraphBounds, setModes }
