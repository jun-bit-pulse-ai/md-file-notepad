# Notepad MD

A live-preview Markdown reader and editor for macOS.

You write plain Markdown and it styles itself as you type — headings grow,
`**bold**` turns bold, tables and math render in place. Move the cursor into
any element and its raw syntax reappears so you can edit it. There is no split
pane and no preview toggle: one editable, rendered document.

<p align="center">
  <img src="docs/screenshot-light.png" alt="Editing a document in light mode" width="880">
  <br>
  <img src="docs/screenshot-dark.png" alt="The same document in dark mode" width="880">
</p>

## Features

**Editing**

- Live preview for headings, emphasis, inline code, highlights, links, images,
  blockquotes, lists, rules and fenced code (with syntax highlighting)
- Tables render as real tables; put the cursor inside to edit the pipe source
- `$inline$` and `$$display$$` math via KaTeX
- Clickable task-list checkboxes that rewrite the underlying Markdown
- Enter continues lists, renumbers ordered ones, and ends the list on an empty item
- Multi-cursor editing, and formatting commands that toggle symmetrically
- Pasting rich text converts it to Markdown

**Reading**

- Outline sidebar that tracks the cursor (`⇧⌘1`)
- File-browser sidebar for the current folder (`⇧⌘2`)
- Focus mode dims everything but the current paragraph (`⇧⌘F`)
- Typewriter mode keeps the caret centred (`⇧⌘T`)
- Word count, character count and reading time in the status bar

**macOS integration**

- Native menu bar with the standard shortcuts, and a chromeless
  hidden-inset title bar
- Follows the system light/dark appearance, or pin either one
- Proxy icon, "Edited" title state, and unsaved-changes prompts on close
- Open Recent, `.md` file associations, and drag-and-drop to open
- Reloads the document when it changes on disk (unless you have unsaved edits)
- Export to HTML and PDF

## Getting started

```bash
npm install
npm start
```

`npm start` builds the renderer bundle and launches the app.

## Building a .app / .dmg

```bash
npm run dist
```

This produces universal `.dmg` and `.zip` installers in `dist/` for both Apple
Silicon and Intel. The build is unsigned by default — to ship it to other
machines, set `CSC_LINK` and `CSC_KEY_PASSWORD` for signing and
`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` for notarisation,
which electron-builder picks up automatically.

For a local unpackaged build, `npm run dist:dir` is faster.

## Development

```bash
npm run watch   # rebuild the renderer on change
npm run dev     # build once, then launch
npm test        # unit tests
npm run smoke   # boot the real app headlessly and screenshot it
```

`npm run smoke` launches the actual main process, preload and renderer under a
virtual display, asserts the editor mounted with no console errors, and writes
a PNG. It takes `--doc`, `--out`, `--scroll` and `--theme` flags. On a Mac with
a display, use `npm run smoke:mac`.

## How it works

```
src/main/       Electron main process — windows, menu, dialogs, file I/O
  main.js       Lifecycle, IPC handlers, window/document bookkeeping
  files.js      Atomic writes, directory listing, disk watching
  store.js      JSON preference store
  menu.js       Native application menu
  preload.js    The renderer's entire privileged surface (contextIsolation on)
src/renderer/   UI (CodeMirror 6)
  editor/
    livePreview.js  The decoration engine — the core of the app
    commands.js     Markdown formatting commands
    widgets.js      Rendered tables, images, math, checkboxes
    modes.js        Focus and typewriter modes
  lib/            Pure logic: outline, stats, Markdown rendering, export
  ui/             Sidebar and status bar
```

The live preview works by decorating the editable text rather than rendering a
copy of it. `livePreview.js` walks the Markdown syntax tree over the visible
range and hides syntax markers, styles spans, and swaps some nodes for rendered
widgets — except where the selection touches, which stays as source. Block-level
replacements (tables, display math) come from a state field, because CodeMirror
requires block decorations to be known before the viewport is measured.

The renderer runs with `contextIsolation` on, `nodeIntegration` off, and a
restrictive CSP. Markdown is rendered with inline HTML disabled, so opening
someone else's file cannot execute script.

## License

MIT
