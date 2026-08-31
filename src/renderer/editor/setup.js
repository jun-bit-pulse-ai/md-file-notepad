import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { bracketMatching, foldKeymap, indentOnInput } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'

import { editorTheme, highlighting } from './theme.js'
import { livePreview, setPreviewConfig } from './livePreview.js'
import { editorModes, setModes } from './modes.js'
import {
  continueList,
  insertCodeBlock,
  insertHorizontalRule,
  insertLink,
  insertTable,
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
} from './commands.js'

/** Compartments let us reconfigure single aspects without rebuilding state. */
const compartments = {
  spellcheck: new Compartment(),
  lineWrapping: new Compartment(),
}

/**
 * Markdown-specific keybindings. These sit before the default keymap so
 * Enter-continues-list wins over the generic newline command.
 */
const markdownKeymap = [
  { key: 'Enter', run: continueList },
  { key: 'Mod-b', run: toggleBold, preventDefault: true },
  { key: 'Mod-i', run: toggleItalic, preventDefault: true },
  { key: 'Mod-e', run: toggleInlineCode, preventDefault: true },
  { key: 'Mod-Shift-x', run: toggleStrikethrough, preventDefault: true },
  { key: 'Mod-Shift-h', run: toggleHighlight, preventDefault: true },
  { key: 'Mod-k', run: (view) => insertLink(view), preventDefault: true },
  { key: 'Mod-Shift-q', run: toggleQuote, preventDefault: true },
  { key: 'Mod-Shift-8', run: toggleBulletList, preventDefault: true },
  { key: 'Mod-Shift-7', run: toggleOrderedList, preventDefault: true },
  { key: 'Mod-Shift-9', run: toggleTaskList, preventDefault: true },
  { key: 'Mod-Shift-d', run: toggleTaskDone, preventDefault: true },
  { key: 'Mod-Alt-c', run: (view) => insertCodeBlock(view), preventDefault: true },
  { key: 'Mod-Alt-t', run: (view) => insertTable(view), preventDefault: true },
  { key: 'Mod-Alt-h', run: insertHorizontalRule, preventDefault: true },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    key: `Mod-${level}`,
    run: setHeading(level),
    preventDefault: true,
  })),
  { key: 'Mod-0', run: setHeading(0), preventDefault: true },
]

function createEditor({ parent, doc = '', onChange, onSelectionChange, prefs = {} }) {
  const extensions = [
    history(),
    // Without this, ⌥-drag and ⌘-click multi-cursor silently collapse to
    // a single range.
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSpecialChars(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    // No fold gutter: a distraction-free writing surface shouldn't have a
    // rail of arrows down the margin. Folding still works from the keymap.
    compartments.lineWrapping.of(EditorView.lineWrapping),
    compartments.spellcheck.of(
      EditorView.contentAttributes.of({
        spellcheck: prefs.spellcheck === false ? 'false' : 'true',
        autocorrect: 'off',
        autocapitalize: 'off',
      })
    ),
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      addKeymap: false,
    }),
    highlighting,
    editorTheme,
    livePreview(),
    editorModes(),
    keymap.of([
      ...markdownKeymap,
      ...closeBracketsKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString(), update)
      }
      if ((update.selectionSet || update.docChanged) && onSelectionChange) {
        onSelectionChange(update.state)
      }
    }),
  ]

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions }),
  })

  // Apply persisted view modes on first paint.
  view.dispatch({
    effects: [
      setPreviewConfig.of({ sourceMode: Boolean(prefs.sourceMode) }),
      setModes.of({
        focusMode: Boolean(prefs.focusMode),
        typewriterMode: Boolean(prefs.typewriterMode),
      }),
    ],
  })

  return view
}

/** Replaces the whole document (opening a file) without stacking undo history. */
function replaceDocument(view, text) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: 0 },
    scrollIntoView: true,
  })
}

function setSpellcheck(view, enabled) {
  view.dispatch({
    effects: compartments.spellcheck.reconfigure(
      EditorView.contentAttributes.of({
        spellcheck: enabled ? 'true' : 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
      })
    ),
  })
}

export { createEditor, markdownKeymap, replaceDocument, setSpellcheck }
