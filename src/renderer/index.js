import '../styles/app.css'
import '../styles/editor.css'
import 'katex/dist/katex.min.css'

import { EditorSelection } from '@codemirror/state'
import { openSearchPanel, closeSearchPanel } from '@codemirror/search'
import TurndownService from 'turndown'

import { createEditor, replaceDocument, setSpellcheck } from './editor/setup.js'
import { setPreviewConfig } from './editor/livePreview.js'
import { setModes } from './editor/modes.js'
import { setDocumentDirectory } from './editor/widgets.js'
import {
  insertImage,
  insertLink,
  insertTable,
  insertCodeBlock,
  insertHorizontalRule,
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
} from './editor/commands.js'
import { Sidebar } from './ui/sidebar.js'
import { StatusBar } from './ui/statusbar.js'
import { buildHtmlDocument } from './lib/export.js'
import { markdownToDocx } from './lib/docx.js'
import { SHORTCUTS, MARKDOWN_REFERENCE } from './lib/help.js'

const api = window.notepad

/** Single source of truth for what the window is currently editing. */
const doc = {
  filePath: null,
  fileName: 'Untitled',
  directory: null,
  savedText: '',
  dirty: false,
}

let prefs = {}
let view
let sidebar
let statusBar

const EDITOR_WIDTHS = {
  narrow: '34em',
  normal: '46em',
  wide: '58em',
  full: 'none',
}

async function boot() {
  prefs = (await api.getPrefs()) || {}

  const editorHost = document.getElementById('editor')
  sidebar = new Sidebar(document.getElementById('sidebar'), {
    onJumpToLine: jumpToLine,
    onOpenFile: (filePath) => openPath(filePath),
  })
  statusBar = new StatusBar(document.getElementById('statusbar'), {
    onToggleMode: toggleMode,
  })

  view = createEditor({
    parent: editorHost,
    doc: '',
    prefs,
    onChange: handleChange,
    onSelectionChange: handleSelectionChange,
  })

  applyPreferences()
  sidebar.setMode(prefs.sidebar === 'closed' ? 'closed' : prefs.sidebar || 'closed')
  statusBar.setModes(prefs)

  registerIpcHandlers()
  registerDomHandlers()
  buildShortcutSheet()

  if (!prefs.recentFiles?.length) showWelcomeDocument()
  view.focus()
}

function applyPreferences() {
  const root = document.documentElement
  root.style.setProperty('--editor-font-size', `${prefs.fontSize || 16}px`)
  root.style.setProperty(
    '--editor-width',
    EDITOR_WIDTHS[prefs.editorWidth] || EDITOR_WIDTHS.normal
  )
  document.body.classList.toggle('is-source-mode', Boolean(prefs.sourceMode))
}

function handleChange(text) {
  const dirty = text !== doc.savedText
  if (dirty !== doc.dirty) {
    doc.dirty = dirty
    api.reportDocumentState({ dirty, filePath: doc.filePath })
  }
  scheduleOutlineUpdate()
}

function handleSelectionChange(state) {
  statusBar.update(state)
  scheduleOutlineUpdate()
}

let outlineTimer = null
function scheduleOutlineUpdate() {
  if (outlineTimer) clearTimeout(outlineTimer)
  outlineTimer = setTimeout(() => {
    const text = view.state.doc.toString()
    const line = view.state.doc.lineAt(view.state.selection.main.head).number
    sidebar.updateOutline(text, line)
  }, 150)
}

function jumpToLine(lineNumber) {
  const line = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines))
  view.dispatch({
    selection: EditorSelection.cursor(line.from),
    effects: [],
    scrollIntoView: true,
  })
  // Put the heading near the top rather than wherever it happened to land.
  view.dispatch({ effects: [] })
  view.focus()
  const block = view.lineBlockAt(line.from)
  view.scrollDOM.scrollTo({ top: Math.max(0, block.top - 24), behavior: 'smooth' })
}

/* ------------------------------------------------------------------ */
/* Document lifecycle                                                  */
/* ------------------------------------------------------------------ */

function loadDocument(payload) {
  doc.filePath = payload.filePath
  doc.fileName = payload.fileName
  doc.directory = payload.directory
  doc.savedText = payload.content
  doc.dirty = false

  setDocumentDirectory(payload.directory)
  replaceDocument(view, payload.content)
  api.reportDocumentState({ dirty: false, filePath: payload.filePath })
  document.title = payload.fileName
  sidebar.setCurrentFile(payload.filePath, payload.directory)
  scheduleOutlineUpdate()

  // Very large files stay in source mode; live preview would crawl.
  if (payload.isLarge && !prefs.sourceMode) {
    setSourceMode(true, { temporary: true })
    statusBar.flash('Large file — opened in source mode', 'warn')
  }
  view.focus()
}

async function openPath(filePath) {
  if (!(await confirmDiscardIfDirty())) return
  const result = await api.openPath(filePath)
  if (result && result.error) statusBar.flash(result.error, 'error')
}

async function confirmDiscardIfDirty() {
  if (!doc.dirty) return true
  const choice = await api.confirmDiscard(doc.fileName)
  if (choice === 'cancel') return false
  if (choice === 'save') return save()
  return true
}

async function save() {
  const content = view.state.doc.toString()
  const result = await api.save({ content, filePath: doc.filePath })
  if (result?.ok) {
    doc.savedText = content
    doc.dirty = false
    if (result.filePath) {
      doc.filePath = result.filePath
      doc.fileName = result.filePath.split('/').pop()
      doc.directory = result.filePath.split('/').slice(0, -1).join('/')
      setDocumentDirectory(doc.directory)
      document.title = doc.fileName
      sidebar.setCurrentFile(doc.filePath, doc.directory)
    }
    api.reportDocumentState({ dirty: false, filePath: doc.filePath })
    statusBar.flash('Saved')
    return true
  }
  if (result && !result.canceled && result.error) {
    statusBar.flash(`Save failed: ${result.error}`, 'error')
  }
  return false
}

async function saveAs() {
  const content = view.state.doc.toString()
  const result = await api.saveAs({ content, filePath: doc.filePath })
  if (result?.ok) {
    doc.savedText = content
    doc.dirty = false
    doc.filePath = result.filePath
    doc.fileName = result.filePath.split('/').pop()
    doc.directory = result.filePath.split('/').slice(0, -1).join('/')
    setDocumentDirectory(doc.directory)
    document.title = doc.fileName
    sidebar.setCurrentFile(doc.filePath, doc.directory)
    statusBar.flash('Saved')
    return true
  }
  return false
}

/** Grabs the KaTeX stylesheet out of the bundle so exports keep their math. */
function collectKatexCss() {
  let css = ''
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.cssText.includes('katex')) css += rule.cssText + '\n'
      }
    } catch {
      /* cross-origin sheet; nothing we need lives there */
    }
  }
  return css
}

async function exportAs(kind) {
  const markdown = view.state.doc.toString()
  const html = buildHtmlDocument(markdown, {
    title: doc.fileName.replace(/\.[^.]+$/, ''),
    katexCss: collectKatexCss(),
  })
  const payload = { html, defaultName: doc.fileName }
  const result = kind === 'pdf' ? await api.exportPdf(payload) : await api.exportHtml(payload)
  if (result?.ok) statusBar.flash(`Exported ${kind.toUpperCase()}`)
  else if (result?.error) statusBar.flash(result.error, 'error')
}

/**
 * Resolves a Markdown image target to an absolute filesystem path.
 * Remote and data URIs are skipped: the export embeds local files only.
 */
function resolveLocalImagePath(src) {
  if (!src || /^(https?:|data:)/i.test(src)) return null
  const cleaned = src.replace(/^file:\/\//, '').replace(/^<|>$/g, '')
  if (cleaned.startsWith('/')) return cleaned
  if (!doc.directory) return null
  return `${doc.directory.replace(/\/$/, '')}/${cleaned.replace(/^\.\//, '')}`
}

/** Loads image bytes and intrinsic size for embedding in a .docx. */
async function loadImageForExport(src) {
  const filePath = resolveLocalImagePath(src)
  if (!filePath) return null

  const result = await api.readBinary(filePath)
  if (!result?.ok || !result.data) return null

  const data = new Uint8Array(result.data)
  try {
    const bitmap = await createImageBitmap(new Blob([data]))
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return { data, ...size }
  } catch {
    // Undecodable here, but Word may still render it; fall back to a size.
    return { data, width: 0, height: 0 }
  }
}

async function exportDocx() {
  const markdown = view.state.doc.toString()
  statusBar.flash('Building Word document…')
  try {
    const buffer = await markdownToDocx(markdown, {
      title: doc.fileName.replace(/\.[^.]+$/, ''),
      loadImage: loadImageForExport,
    })
    const result = await api.exportDocx({
      data: new Uint8Array(buffer),
      defaultName: doc.fileName,
    })
    if (result?.ok) statusBar.flash('Exported DOCX')
    else if (result?.error) statusBar.flash(result.error, 'error')
  } catch (err) {
    console.error('[export] docx failed', err)
    statusBar.flash(`Word export failed: ${err.message}`, 'error')
  }
}

/** Spell checking is Chromium's; this toggles it in both processes. */
async function toggleSpellcheck() {
  const next = prefs.spellcheck === false
  prefs.spellcheck = next
  setSpellcheck(view, next)
  await api.setSpellcheck(next)
  await api.setPrefs({ spellcheck: next })
  statusBar.flash(next ? 'Spell check on' : 'Spell check off')
}

/* ------------------------------------------------------------------ */
/* View modes                                                          */
/* ------------------------------------------------------------------ */

function setSourceMode(enabled, { temporary = false } = {}) {
  view.dispatch({ effects: setPreviewConfig.of({ sourceMode: enabled }) })
  document.body.classList.toggle('is-source-mode', enabled)
  if (!temporary) {
    prefs.sourceMode = enabled
    api.setPrefs({ sourceMode: enabled })
  }
  statusBar.setModes({ ...prefs, sourceMode: enabled })
}

function toggleMode(mode) {
  if (mode === 'sourceMode') return setSourceMode(!prefs.sourceMode)
  const next = !prefs[mode]
  prefs[mode] = next
  view.dispatch({ effects: setModes.of({ [mode]: next }) })
  api.setPrefs({ [mode]: next })
  statusBar.setModes(prefs)
  document.body.classList.toggle(
    mode === 'focusMode' ? 'is-focus-mode' : 'is-typewriter-mode',
    next
  )
}

function setTheme(theme) {
  prefs.theme = theme
  api.setPrefs({ theme })
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

function setEditorWidth(width) {
  prefs.editorWidth = width
  document.documentElement.style.setProperty(
    '--editor-width',
    EDITOR_WIDTHS[width] || EDITOR_WIDTHS.normal
  )
  api.setPrefs({ editorWidth: width })
}

function zoom(delta) {
  const next = Math.min(28, Math.max(11, (prefs.fontSize || 16) + delta))
  prefs.fontSize = next
  document.documentElement.style.setProperty('--editor-font-size', `${next}px`)
  api.setPrefs({ fontSize: next })
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

const MENU_ACTIONS = {
  'file:save': () => save(),
  'file:save-as': () => saveAs(),
  'file:export-html': () => exportAs('html'),
  'file:export-pdf': () => exportAs('pdf'),
  'file:export-docx': () => exportDocx(),
  'file:reveal': () => doc.filePath && api.revealInFinder(doc.filePath),
  'file:new': () => api.newFile(),

  'edit:find': () => openSearchPanel(view),
  'edit:replace': () => openSearchPanel(view),
  'edit:copy-markdown': () => copySelectionAsMarkdown(),
  'edit:paste-plain': () => pastePlainText(),
  'edit:toggle-spellcheck': () => toggleSpellcheck(),

  'format:bold': () => toggleBold(view),
  'format:italic': () => toggleItalic(view),
  'format:strikethrough': () => toggleStrikethrough(view),
  'format:code': () => toggleInlineCode(view),
  'format:highlight': () => toggleHighlight(view),
  'format:link': () => insertLink(view),
  'format:image': () => insertImage(view),
  'format:paragraph': () => setHeading(0)(view),
  'format:bullet-list': () => toggleBulletList(view),
  'format:ordered-list': () => toggleOrderedList(view),
  'format:task-list': () => toggleTaskList(view),
  'format:toggle-task': () => toggleTaskDone(view),
  'format:quote': () => toggleQuote(view),
  'format:code-block': () => insertCodeBlock(view),
  'format:table': () => insertTable(view),
  'format:hr': () => insertHorizontalRule(view),

  'view:source-mode': () => setSourceMode(!prefs.sourceMode),
  'view:focus-mode': () => toggleMode('focusMode'),
  'view:typewriter-mode': () => toggleMode('typewriterMode'),
  'view:outline': () => persistSidebar(sidebar.toggle('outline')),
  'view:files': () => persistSidebar(sidebar.toggle('files')),
  'view:theme-system': () => setTheme('system'),
  'view:theme-light': () => setTheme('light'),
  'view:theme-dark': () => setTheme('dark'),
  'view:width-narrow': () => setEditorWidth('narrow'),
  'view:width-normal': () => setEditorWidth('normal'),
  'view:width-wide': () => setEditorWidth('wide'),
  'view:width-full': () => setEditorWidth('full'),
  'view:zoom-in': () => zoom(1),
  'view:zoom-out': () => zoom(-1),
  'view:zoom-reset': () => zoom(16 - (prefs.fontSize || 16)),

  'help:shortcuts': () => document.getElementById('shortcuts-sheet').showModal(),
  'help:reference': () => loadReferenceDocument(),
  preferences: () => document.getElementById('shortcuts-sheet').showModal(),
}

function persistSidebar(mode) {
  prefs.sidebar = mode
  api.setPrefs({ sidebar: mode })
  if (mode === 'outline') scheduleOutlineUpdate()
}

function registerIpcHandlers() {
  api.onMenuCommand((command) => {
    const action = MENU_ACTIONS[command]
    if (action) action()
    else console.warn('[renderer] unhandled menu command:', command)
    view.focus()
  })

  api.onLoadDocument(loadDocument)

  api.onThemeChanged(({ dark }) => applyTheme(dark))

  // Main asks for content when a dirty window is being closed.
  api.onRequestSave(async ({ replyChannel }) => {
    const ok = await save()
    api.reportDocumentState({ dirty: !ok, filePath: doc.filePath })
    api.replyToMain(replyChannel, ok)
  })

  api.onFileChangedOnDisk(async ({ filePath }) => {
    if (filePath !== doc.filePath) return
    if (doc.dirty) {
      statusBar.flash('File changed on disk — your version is unsaved', 'warn')
      return
    }
    const fresh = await api.readFile(filePath)
    if (fresh && !fresh.error && fresh.content !== view.state.doc.toString()) {
      const scroll = view.scrollDOM.scrollTop
      replaceDocument(view, fresh.content)
      doc.savedText = fresh.content
      view.scrollDOM.scrollTop = scroll
      statusBar.flash('Reloaded from disk')
    }
  })

  applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
}

function registerDomHandlers() {
  // Drag a .md file onto the window to open it.
  window.addEventListener('dragover', (event) => event.preventDefault())
  window.addEventListener('drop', async (event) => {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file?.path) await openPath(file.path)
  })

  window.addEventListener('beforeunload', () => {
    if (doc.dirty) api.reportDocumentState({ dirty: true, filePath: doc.filePath })
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSearchPanel(view)
  })
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

/** Pasting rich text (a web page, a doc) converts it to markdown. */
function pastePlainText() {
  navigator.clipboard.readText().then((text) => {
    const range = view.state.selection.main
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length },
      userEvent: 'input.paste',
    })
  })
}

function copySelectionAsMarkdown() {
  const range = view.state.selection.main
  const text = range.empty
    ? view.state.doc.toString()
    : view.state.doc.sliceString(range.from, range.to)
  navigator.clipboard.writeText(text)
  statusBar.flash('Copied as Markdown')
}

// Rich-text paste -> markdown, unless the user asked for plain text.
document.addEventListener('paste', (event) => {
  const html = event.clipboardData?.getData('text/html')
  if (!html || !view.hasFocus) return
  event.preventDefault()
  const markdown = turndown.turndown(html)
  const range = view.state.selection.main
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: markdown },
    selection: { anchor: range.from + markdown.length },
    userEvent: 'input.paste',
  })
})

function buildShortcutSheet() {
  const grid = document.getElementById('shortcut-grid')
  grid.replaceChildren(
    ...SHORTCUTS.flatMap(({ group, items }) => {
      const heading = document.createElement('h3')
      heading.className = 'shortcut-group'
      heading.textContent = group
      const rows = items.map(([keys, label]) => {
        const row = document.createElement('div')
        row.className = 'shortcut-row'
        const kbd = document.createElement('kbd')
        kbd.textContent = keys
        const name = document.createElement('span')
        name.textContent = label
        row.append(kbd, name)
        return row
      })
      return [heading, ...rows]
    })
  )
}

async function loadReferenceDocument() {
  if (!(await confirmDiscardIfDirty())) return
  replaceDocument(view, MARKDOWN_REFERENCE)
  doc.filePath = null
  doc.fileName = 'Markdown Reference'
  doc.savedText = MARKDOWN_REFERENCE
  doc.dirty = false
  document.title = doc.fileName
  api.reportDocumentState({ dirty: false, filePath: null })
  scheduleOutlineUpdate()
}

function showWelcomeDocument() {
  replaceDocument(view, MARKDOWN_REFERENCE)
  doc.savedText = MARKDOWN_REFERENCE
  scheduleOutlineUpdate()
}

boot().catch((err) => {
  console.error('[renderer] boot failed', err)
  document.body.innerHTML = `<pre class="fatal">${err.stack || err.message}</pre>`
})
