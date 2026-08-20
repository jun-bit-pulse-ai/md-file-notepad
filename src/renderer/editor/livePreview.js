import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import { StateEffect, StateField } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

import {
  BulletWidget,
  CodeInfoWidget,
  HorizontalRuleWidget,
  ImageWidget,
  LinkTargetWidget,
  MathWidget,
  TableWidget,
  TaskWidget,
} from './widgets.js'

/**
 * Live preview: markdown is styled in place and its syntax markers are
 * hidden, except in the block the cursor is currently in — that block
 * reveals its source so it stays editable. This is the whole trick; the
 * rest of the file is the per-node bookkeeping.
 */

const setPreviewConfig = StateEffect.define()

const previewConfig = StateField.define({
  create: () => ({ sourceMode: false }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPreviewConfig)) return { ...value, ...effect.value }
    }
    return value
  },
})

const hidden = Decoration.replace({})

const lineDeco = (cls) => Decoration.line({ class: cls })
const markDeco = (cls) => Decoration.mark({ class: cls })

const HEADING_RE = /^ATXHeading(\d)$/
const SETEXT_RE = /^SetextHeading(\d)$/

/** Inline math and highlight aren't in the Lezer grammar, so scan text. */
const INLINE_MATH_RE = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g
const HIGHLIGHT_RE = /==([^=\n]+)==/g

class DecorationCollector {
  constructor() {
    this.items = []
  }

  add(from, to, decoration) {
    if (from > to) return
    this.items.push(decoration.range(from, to))
  }

  line(pos, cls) {
    this.items.push(lineDeco(cls).range(pos))
  }

  finish() {
    // `true` sorts; tree iteration order doesn't match RangeSet's contract.
    return Decoration.set(this.items, true)
  }
}

function buildDecorations(view) {
  const collector = new DecorationCollector()
  const { state } = view
  const config = state.field(previewConfig, false) || { sourceMode: false }
  if (config.sourceMode) return Decoration.none

  const selection = state.selection
  const doc = state.doc

  /** True when any cursor/selection touches [from, to] — reveal the source. */
  const isActive = (from, to) => {
    for (const range of selection.ranges) {
      if (range.to >= from && range.from <= to) return true
    }
    return false
  }

  /** Block-level reveal: active if the selection touches any of its lines. */
  const isBlockActive = (from, to) => {
    const start = doc.lineAt(from).from
    const end = doc.lineAt(to).to
    return isActive(start, end)
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        const nodeFrom = node.from
        const nodeTo = node.to

        // --- Headings -------------------------------------------------
        const atx = HEADING_RE.exec(name)
        if (atx) {
          const level = Number(atx[1])
          const line = doc.lineAt(nodeFrom)
          collector.line(line.from, `cm-md-heading cm-md-h${level}`)
          if (!isActive(line.from, line.to)) {
            const mark = node.node.getChild('HeaderMark')
            if (mark) {
              // Hide the '#'s and the space that follows them.
              const after = doc.sliceString(mark.to, Math.min(mark.to + 1, doc.length))
              collector.add(mark.from, mark.to + (after === ' ' ? 1 : 0), hidden)
            }
          }
          return
        }

        const setext = SETEXT_RE.exec(name)
        if (setext) {
          const level = Number(setext[1])
          const firstLine = doc.lineAt(nodeFrom)
          collector.line(firstLine.from, `cm-md-heading cm-md-h${level}`)
          if (!isBlockActive(nodeFrom, nodeTo)) {
            const mark = node.node.getChild('HeaderMark')
            if (mark) collector.add(mark.from - 1, mark.to, hidden)
          }
          return
        }

        switch (name) {
          // --- Inline emphasis ----------------------------------------
          case 'StrongEmphasis':
          case 'Emphasis':
          case 'Strikethrough': {
            const cls =
              name === 'StrongEmphasis'
                ? 'cm-md-strong'
                : name === 'Emphasis'
                  ? 'cm-md-em'
                  : 'cm-md-strike'
            collector.add(nodeFrom, nodeTo, markDeco(cls))
            if (!isActive(nodeFrom, nodeTo)) {
              for (const child of childrenOf(node)) {
                if (child.name.endsWith('Mark')) {
                  collector.add(child.from, child.to, hidden)
                }
              }
            }
            return
          }

          case 'InlineCode': {
            collector.add(nodeFrom, nodeTo, markDeco('cm-md-code'))
            if (!isActive(nodeFrom, nodeTo)) {
              for (const child of childrenOf(node)) {
                if (child.name === 'CodeMark') collector.add(child.from, child.to, hidden)
              }
            }
            return
          }

          // --- Links and images ---------------------------------------
          case 'Image': {
            if (isActive(nodeFrom, nodeTo)) return
            const raw = doc.sliceString(nodeFrom, nodeTo)
            const parsed = /^!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+["'(](.*)["')])?\s*\)$/.exec(raw)
            if (!parsed) return
            collector.add(
              nodeFrom,
              nodeTo,
              Decoration.replace({ widget: new ImageWidget(parsed[2], parsed[1], parsed[3]) })
            )
            return
          }

          case 'Link': {
            const active = isActive(nodeFrom, nodeTo)
            collector.add(nodeFrom, nodeTo, markDeco('cm-md-link'))
            if (active) return
            const urlNode = node.node.getChild('URL')
            const marks = childrenOf(node).filter((c) => c.name === 'LinkMark')
            // Hide '[', ']', '(' and ')' but keep the label visible.
            for (const mark of marks) collector.add(mark.from, mark.to, hidden)
            if (urlNode) {
              const url = doc.sliceString(urlNode.from, urlNode.to)
              collector.add(
                urlNode.from,
                nodeTo,
                Decoration.replace({ widget: new LinkTargetWidget(url) })
              )
            }
            return
          }

          case 'URL': // autolinks
            collector.add(nodeFrom, nodeTo, markDeco('cm-md-link'))
            return

          // --- Blocks --------------------------------------------------
          case 'Blockquote': {
            for (let pos = nodeFrom; pos <= nodeTo; ) {
              const line = doc.lineAt(pos)
              collector.line(line.from, 'cm-md-quote')
              if (pos > nodeTo) break
              pos = line.to + 1
            }
            if (!isBlockActive(nodeFrom, nodeTo)) {
              for (const child of childrenOf(node)) {
                if (child.name === 'QuoteMark') {
                  const after = doc.sliceString(child.to, Math.min(child.to + 1, doc.length))
                  collector.add(child.from, child.to + (after === ' ' ? 1 : 0), hidden)
                }
              }
            }
            return
          }

          case 'HorizontalRule': {
            if (isBlockActive(nodeFrom, nodeTo)) {
              collector.line(doc.lineAt(nodeFrom).from, 'cm-md-hr-source')
              return
            }
            collector.add(
              nodeFrom,
              nodeTo,
              Decoration.replace({ widget: new HorizontalRuleWidget() })
            )
            return
          }

          case 'FencedCode': {
            const active = isBlockActive(nodeFrom, nodeTo)
            const startLine = doc.lineAt(nodeFrom)
            const endLine = doc.lineAt(nodeTo)
            for (let n = startLine.number; n <= endLine.number; n++) {
              const line = doc.line(n)
              const classes = ['cm-md-codeblock']
              if (n === startLine.number) classes.push('cm-md-codeblock-first')
              if (n === endLine.number) classes.push('cm-md-codeblock-last')
              collector.line(line.from, classes.join(' '))
            }
            if (!active) {
              const marks = childrenOf(node).filter((c) => c.name === 'CodeMark')
              const info = node.node.getChild('CodeInfo')
              for (const mark of marks) collector.add(mark.from, mark.to, hidden)
              if (info) {
                const language = doc.sliceString(info.from, info.to)
                collector.add(
                  info.from,
                  info.to,
                  Decoration.replace({ widget: new CodeInfoWidget(language) })
                )
              }
            }
            return
          }

          case 'Table': {
            // The rendered (block) form is produced by blockDecorations;
            // a plugin may only contribute inline and line decorations.
            if (!isBlockActive(nodeFrom, nodeTo)) return
            const startLine = doc.lineAt(nodeFrom)
            const endLine = doc.lineAt(nodeTo)
            for (let n = startLine.number; n <= endLine.number; n++) {
              collector.line(doc.line(n).from, 'cm-md-table-source')
            }
            return
          }

          // --- Lists ----------------------------------------------------
          case 'ListItem': {
            const line = doc.lineAt(nodeFrom)
            collector.line(line.from, 'cm-md-list-item')
            const marker = node.node.getChild('ListMark')
            // The GFM parser nests the marker as ListItem > Task > TaskMarker.
            const task = node.node.getChild('Task')?.getChild('TaskMarker')
            if (task) {
              const checked = doc.sliceString(task.from, task.to).toLowerCase().includes('x')
              collector.add(
                task.from,
                task.to,
                Decoration.replace({ widget: new TaskWidget(checked, task.from, task.to) })
              )
              if (checked) collector.line(line.from, 'cm-md-task-done')
            }
            if (marker && !isActive(line.from, line.to)) {
              const bulletChar = doc.sliceString(marker.from, marker.to)
              if (/^[-*+]$/.test(bulletChar)) {
                const depth = Math.floor((marker.from - line.from) / 2)
                collector.add(
                  marker.from,
                  marker.to,
                  Decoration.replace({ widget: new BulletWidget(depth) })
                )
              } else {
                collector.add(marker.from, marker.to, markDeco('cm-md-ordered-mark'))
              }
            }
            return
          }

          case 'Paragraph':
            collector.line(doc.lineAt(nodeFrom).from, 'cm-md-paragraph')
            return

          default:
            return
        }
      },
    })

    // Math and ==highlight== live outside the grammar; scan the visible text.
    scanInlinePatterns(view, collector, from, to, isActive)
  }

  return collector.finish()
}

function childrenOf(node) {
  const out = []
  let child = node.node.firstChild
  while (child) {
    out.push({ name: child.name, from: child.from, to: child.to })
    child = child.nextSibling
  }
  return out
}

/**
 * Inline `$x$` math and `==marks==`. Skipped inside code, where a dollar
 * sign is just a dollar sign.
 */
function scanInlinePatterns(view, collector, from, to, isActive) {
  const { state } = view
  const text = state.doc.sliceString(from, to)
  const tree = syntaxTree(state)

  const inCode = (pos) => {
    let node = tree.resolveInner(pos, 1)
    while (node) {
      if (node.name === 'InlineCode' || node.name === 'FencedCode' || node.name === 'CodeBlock') {
        return true
      }
      node = node.parent
    }
    return false
  }

  HIGHLIGHT_RE.lastIndex = 0
  let match
  while ((match = HIGHLIGHT_RE.exec(text))) {
    const start = from + match.index
    const end = start + match[0].length
    if (inCode(start)) continue
    collector.add(start, end, markDeco('cm-md-highlight'))
    if (!isActive(start, end)) {
      collector.add(start, start + 2, hidden)
      collector.add(end - 2, end, hidden)
    }
  }

  INLINE_MATH_RE.lastIndex = 0
  while ((match = INLINE_MATH_RE.exec(text))) {
    const start = from + match.index
    const end = start + match[0].length
    if (inCode(start)) continue
    if (isActive(start, end)) {
      collector.add(start, end, markDeco('cm-md-math-source'))
      continue
    }
    collector.add(
      start,
      end,
      Decoration.replace({ widget: new MathWidget(match[1], false) })
    )
  }
}

/**
 * Block-level decorations: rendered tables and `$$ display math $$`.
 *
 * These must come from a state field — CodeMirror rejects block decorations
 * supplied by a view plugin, because they change block layout and so have to
 * be known before the viewport is measured. That also means they are
 * computed over the whole document rather than just the visible range.
 */
function buildBlockDecorations(state) {
  const config = state.field(previewConfig, false) || { sourceMode: false }
  if (config.sourceMode) return Decoration.none

  const { doc } = state
  const items = []

  const isBlockActive = (from, to) => {
    const start = doc.lineAt(from).from
    const end = doc.lineAt(to).to
    for (const range of state.selection.ranges) {
      if (range.to >= start && range.from <= end) return true
    }
    return false
  }

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return
      if (isBlockActive(node.from, node.to)) return
      // A block replacement has to span whole lines exactly.
      const from = doc.lineAt(node.from).from
      const to = doc.lineAt(node.to).to
      items.push(
        Decoration.replace({
          widget: new TableWidget(doc.sliceString(from, to)),
          block: true,
        }).range(from, to)
      )
    },
  })

  let openLine = null
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (line.text.trim() !== '$$') continue
    if (openLine === null) {
      openLine = line
      continue
    }
    if (!isBlockActive(openLine.from, line.to)) {
      const source = doc.sliceString(openLine.to + 1, line.from - 1)
      items.push(
        Decoration.replace({
          widget: new MathWidget(source, true),
          block: true,
        }).range(openLine.from, line.to)
      )
    }
    openLine = null
  }

  return Decoration.set(items, true)
}

const blockDecorations = StateField.define({
  create: (state) => buildBlockDecorations(state),
  update(_value, tr) {
    // Rebuilt on every transaction, including the empty ones the language
    // package dispatches as background parsing advances — otherwise a table
    // past the initial parse horizon would never render.
    return buildBlockDecorations(tr.state)
  },
  provide: (field) => EditorView.decorations.from(field),
})

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view)
    }

    update(update) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(setPreviewConfig))
        )
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    // Treat replaced markers as single units so arrow keys step over a
    // hidden `**` instead of landing inside it.
    provide: () =>
      EditorView.atomicRanges.of((view) => {
        const plugin = view.plugin(livePreviewPlugin)
        return plugin ? plugin.decorations : Decoration.none
      }),
  }
)

/** ⌘-click (or ctrl-click) a rendered link to open it in the browser. */
const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!event.metaKey && !event.ctrlKey) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos == null) return false
    let node = syntaxTree(view.state).resolveInner(pos, 1)
    while (node && node.name !== 'Link' && node.name !== 'URL') node = node.parent
    if (!node) return false
    const text = view.state.doc.sliceString(node.from, node.to)
    const url = /\(([^)]+)\)/.exec(text)?.[1] || text
    if (/^https?:/i.test(url) && window.notepad?.openExternal) {
      window.notepad.openExternal(url)
      event.preventDefault()
      return true
    }
    return false
  },
})

function livePreview() {
  return [previewConfig, blockDecorations, livePreviewPlugin, linkClickHandler]
}

export { blockDecorations, livePreview, previewConfig, setPreviewConfig }
