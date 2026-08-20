import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * Structural editor styling only. Colours come from CSS custom properties
 * defined in styles/themes.css, so switching light/dark is a single
 * attribute flip on <html> with no CodeMirror reconfiguration.
 */
const editorTheme = EditorView.theme({
  '&': {
    fontSize: 'var(--editor-font-size, 16px)',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-body)',
    lineHeight: '1.72',
    overflowY: 'auto',
    padding: '0',
  },
  '.cm-content': {
    caretColor: 'var(--caret)',
    padding: 'var(--editor-padding-top, 56px) 0 45vh',
    maxWidth: 'var(--editor-width, 46em)',
    margin: '0 auto',
    width: '100%',
  },
  '.cm-line': {
    padding: '0 8px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--caret)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--text-faint)',
    border: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8em',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--surface-2)',
    border: 'none',
    color: 'var(--text-muted)',
    borderRadius: '4px',
    padding: '0 6px',
  },
  '.cm-panels': {
    backgroundColor: 'var(--surface-1)',
    color: 'var(--text)',
    borderTop: '1px solid var(--border)',
  },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-searchMatch': {
    backgroundColor: 'var(--search-match)',
    outline: '1px solid var(--search-match-border)',
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--search-match-active)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 8px 28px var(--shadow)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: '#fff',
  },
})

/**
 * Syntax colours for fenced code blocks (the markdown text itself is styled
 * by the live-preview decorations, not by highlight tags).
 */
const codeHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: 'var(--syn-name)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--syn-function)' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--syn-constant)' },
  { tag: [t.definition(t.name), t.separator], color: 'var(--syn-name)' },
  {
    tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace],
    color: 'var(--syn-type)',
  },
  {
    tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)],
    color: 'var(--syn-operator)',
  },
  { tag: [t.meta, t.comment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: 'var(--syn-string)' },
  { tag: t.invalid, color: 'var(--danger)' },
])

const highlighting = syntaxHighlighting(codeHighlight, { fallback: true })

export { codeHighlight, editorTheme, highlighting }
