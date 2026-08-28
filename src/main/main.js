const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')

const { IPC } = require('../shared/ipc.js')
const { Store } = require('./store.js')
const { buildMenu } = require('./menu.js')
const {
  applySpellCheckerSettings,
  buildContextMenuTemplate,
} = require('./spellcheck.js')
const {
  FILE_FILTERS,
  isMarkdownPath,
  listDirectory,
  readDocument,
  suggestFileName,
  walkDirectory,
  watchFile,
  writeDocument,
} = require('./files.js')

const isMac = process.platform === 'darwin'
let store
/** Per-window bookkeeping: open path, dirty flag, disk watcher. */
const windowState = new Map()
/** Files handed to us by the OS before a window exists (open-file / argv). */
const pendingOpenPaths = []

function stateFor(win) {
  if (!windowState.has(win.id)) {
    windowState.set(win.id, { filePath: null, dirty: false, unwatch: null })
  }
  return windowState.get(win.id)
}

function createWindow(openPath = null) {
  const bounds = store.get('windowBounds') || {}
  const win = new BrowserWindow({
    width: bounds.width || 1080,
    height: bounds.height || 760,
    x: bounds.x,
    y: bounds.y,
    minWidth: 520,
    minHeight: 400,
    show: false,
    title: 'Untitled',
    // Chromeless-but-native: the traffic lights float over the editor.
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  })

  win.loadFile(path.join(__dirname, '../../build/index.html'))

  win.once('ready-to-show', () => {
    win.show()
    if (openPath) loadFileIntoWindow(win, openPath)
  })

  win.on('close', (event) => {
    const state = stateFor(win)
    if (state.dirty && !state.forceClose) {
      event.preventDefault()
      promptSaveBeforeClose(win)
    }
  })

  win.on('closed', () => {
    const state = windowState.get(win.id)
    if (state?.unwatch) state.unwatch()
    windowState.delete(win.id)
  })

  const persistBounds = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return
    store.set('windowBounds', win.getBounds())
  }
  win.on('resized', persistBounds)
  win.on('moved', persistBounds)

  // Links in rendered markdown open in the user's browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
    }
  })

  // Right-click: spelling suggestions first, then the usual edit items.
  win.webContents.on('context-menu', (_event, params) => {
    const template = buildContextMenuTemplate(params, {
      onReplaceMisspelling: (word) => win.webContents.replaceMisspelling(word),
      onAddToDictionary: (word) =>
        win.webContents.session.addWordToSpellCheckerDictionary(word),
      onCommand: (command) => win.webContents.send(IPC.MENU_COMMAND, command),
    })
    Menu.buildFromTemplate(template).popup({ window: win })
  })

  return win
}

/** Asks the user what to do about unsaved work, then closes or stays open. */
async function promptSaveBeforeClose(win) {
  const state = stateFor(win)
  const name = state.filePath ? path.basename(state.filePath) : 'Untitled'
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: `Do you want to save the changes you made to “${name}”?`,
    detail: "Your changes will be lost if you don't save them.",
  })

  if (response === 2) return
  if (response === 1) {
    state.dirty = false
    state.forceClose = true
    win.close()
    return
  }

  // Save: ask the renderer for content, then close once it lands on disk.
  const saved = await requestSaveFromRenderer(win)
  if (saved) {
    state.dirty = false
    state.forceClose = true
    win.close()
  }
}

/**
 * Round-trips to the renderer for the current document text. Resolves false
 * if the renderer never answers, so a wedged window can't block quitting.
 */
function requestSaveFromRenderer(win) {
  return new Promise((resolve) => {
    const channel = `${IPC.REQUEST_SAVE}:reply:${Date.now()}`
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(channel)
      resolve(false)
    }, 5000)
    ipcMain.once(channel, (_event, ok) => {
      clearTimeout(timer)
      resolve(Boolean(ok))
    })
    win.webContents.send(IPC.REQUEST_SAVE, { replyChannel: channel })
  })
}

async function loadFileIntoWindow(win, filePath) {
  try {
    const doc = await readDocument(filePath)
    const state = stateFor(win)
    if (state.unwatch) state.unwatch()
    state.filePath = filePath
    state.dirty = false
    state.mtimeMs = doc.mtimeMs
    state.unwatch = watchFile(filePath, ({ mtimeMs }) => {
      // Ignore the echo of our own save.
      if (Math.abs(mtimeMs - (state.mtimeMs || 0)) < 2) return
      state.mtimeMs = mtimeMs
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.FILE_CHANGED_ON_DISK, { filePath })
      }
    })

    store.addRecent(filePath)
    app.addRecentDocument(filePath)
    refreshMenu()
    win.webContents.send(IPC.LOAD_DOCUMENT, doc)
    updateWindowTitle(win)
    return doc
  } catch (err) {
    dialog.showMessageBox(win, {
      type: 'error',
      message: 'Unable to open file',
      detail: `${filePath}\n\n${err.message}`,
    })
    return null
  }
}

function updateWindowTitle(win) {
  if (win.isDestroyed()) return
  const state = stateFor(win)
  const name = state.filePath ? path.basename(state.filePath) : 'Untitled'
  win.setTitle(state.dirty ? `${name} — Edited` : name)
  // Drives the proxy icon and the dot in the macOS close button.
  if (state.filePath) win.setRepresentedFilename(state.filePath)
  win.setDocumentEdited(Boolean(state.dirty))
}

/**
 * Picks a document to open out of a process argv list.
 *
 * Only an existing markdown file counts: Electron's argv also carries the
 * executable, switches, and (in development) the script or app directory,
 * none of which should be loaded as a document.
 */
function documentArgFrom(argv) {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-') || arg === '.') continue
    const resolved = path.resolve(arg)
    if (!isMarkdownPath(resolved)) continue
    try {
      if (fsSync.statSync(resolved).isFile()) return resolved
    } catch {
      /* not a readable path; keep looking */
    }
  }
  return null
}

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
}

function refreshMenu() {
  buildMenu({
    store,
    send: (command) => {
      const win = focusedWindow()
      if (win) win.webContents.send(IPC.MENU_COMMAND, command)
    },
    onOpenFile: () => showOpenDialog(),
    onOpenRecent: (filePath) => openPathInBestWindow(filePath),
    onClearRecent: () => {
      store.clearRecent()
      app.clearRecentDocuments()
      refreshMenu()
    },
    onNewWindow: () => createWindow(),
  })
}

async function showOpenDialog() {
  const win = focusedWindow()
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: FILE_FILTERS,
  })
  if (canceled || !filePaths.length) return null
  return openPathInBestWindow(filePaths[0])
}

/**
 * Reuses an untouched empty window (the usual case right after launch)
 * instead of stacking a second one on top of it.
 */
async function openPathInBestWindow(filePath) {
  const existing = BrowserWindow.getAllWindows().find(
    (w) => windowState.get(w.id)?.filePath === filePath
  )
  if (existing) {
    existing.focus()
    return null
  }
  const current = focusedWindow()
  const state = current ? stateFor(current) : null
  if (current && state && !state.filePath && !state.dirty) {
    return loadFileIntoWindow(current, filePath)
  }
  const win = createWindow(filePath)
  return win
}

function registerIpc() {
  ipcMain.handle(IPC.FILE_NEW, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    createWindow()
    return { ok: true, from: win?.id ?? null }
  })

  ipcMain.handle(IPC.FILE_OPEN, () => showOpenDialog())

  ipcMain.handle(IPC.FILE_OPEN_PATH, async (event, filePath) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    return loadFileIntoWindow(win, filePath)
  })

  ipcMain.handle(IPC.FILE_READ, async (_event, filePath) => {
    try {
      return await readDocument(filePath)
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle(IPC.FILE_SAVE, async (event, { content, filePath }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const state = win ? stateFor(win) : {}
    const target = filePath || state.filePath
    if (!target) return saveAs(event, { content })
    try {
      const result = await writeDocument(target, content)
      state.filePath = target
      state.dirty = false
      state.mtimeMs = result.mtimeMs
      store.addRecent(target)
      app.addRecentDocument(target)
      refreshMenu()
      if (win) updateWindowTitle(win)
      return { ok: true, ...result }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.FILE_SAVE_AS, saveAs)

  ipcMain.handle(IPC.FILE_EXPORT_HTML, async (event, { html, defaultName }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: (defaultName || 'Untitled').replace(/\.[^.]+$/, '') + '.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      await fs.writeFile(filePath, html, 'utf8')
      return { ok: true, filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  /**
   * Renders the exported HTML in an offscreen window and prints it, so the
   * PDF matches the preview rather than the editor's scroll position.
   */
  ipcMain.handle(IPC.FILE_EXPORT_PDF, async (event, { html, defaultName }) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(parent, {
      defaultPath: (defaultName || 'Untitled').replace(/\.[^.]+$/, '') + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }

    const printer = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, javascript: false },
    })
    try {
      await printer.loadURL(
        'data:text/html;charset=utf-8,' + encodeURIComponent(html)
      )
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: 'default' },
        pageSize: 'A4',
      })
      await fs.writeFile(filePath, pdf)
      return { ok: true, filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    } finally {
      printer.destroy()
    }
  })

  ipcMain.handle(IPC.FILE_EXPORT_DOCX, async (event, { data, defaultName }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: (defaultName || 'Untitled').replace(/\.[^.]+$/, '') + '.docx',
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      await fs.writeFile(filePath, Buffer.from(data))
      return { ok: true, filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.FILE_READ_BINARY, async (_event, filePath) => {
    try {
      const buffer = await fs.readFile(filePath)
      // Uint8Array survives structured cloning; Buffer does not round-trip.
      return { ok: true, data: new Uint8Array(buffer) }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.SPELLCHECK_SET, (_event, enabled) => {
    store.set('spellcheck', Boolean(enabled))
    const applied = applySpellCheckerSettings(session.defaultSession, {
      enabled: Boolean(enabled),
      languages: store.get('spellcheckLanguages'),
    })
    refreshMenu()
    return applied
  })

  ipcMain.handle(IPC.FILE_REVEAL, (_event, filePath) => {
    if (!filePath) return { ok: false }
    shell.showItemInFolder(filePath)
    return { ok: true }
  })

  ipcMain.handle(IPC.FILE_LIST_DIR, async (_event, dirPath) => {
    try {
      return await listDirectory(dirPath)
    } catch (err) {
      return { path: dirPath, entries: [], error: err.message }
    }
  })

  ipcMain.handle(IPC.FILE_WALK_DIR, async (_event, dirPath) => {
    try {
      return await walkDirectory(dirPath)
    } catch (err) {
      return { root: dirPath, files: [], truncated: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.RECENT_LIST, () => store.pruneRecent())
  ipcMain.handle(IPC.RECENT_CLEAR, () => {
    store.clearRecent()
    app.clearRecentDocuments()
    refreshMenu()
    return []
  })

  ipcMain.handle(IPC.PREFS_GET, () => store.get())
  ipcMain.handle(IPC.PREFS_SET, (_event, patch) => {
    const next = store.set(patch)
    if (patch && patch.theme) applyTheme(patch.theme)
    return next
  })

  ipcMain.on(IPC.DOC_STATE, (event, { dirty, filePath }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const state = stateFor(win)
    state.dirty = Boolean(dirty)
    if (filePath !== undefined) state.filePath = filePath
    updateWindowTitle(win)
  })

  ipcMain.handle(IPC.CONFIRM_DISCARD, async (event, fileName) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: `Do you want to save the changes you made to “${fileName || 'Untitled'}”?`,
      detail: "Your changes will be lost if you don't save them.",
    })
    return ['save', 'discard', 'cancel'][response]
  })

  ipcMain.handle(IPC.OPEN_EXTERNAL, (_event, url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { ok: true }
  })
}

async function saveAs(event, { content, filePath }) {
  const win = BrowserWindow.fromWebContents(event.sender)
  const state = win ? stateFor(win) : {}
  const { canceled, filePath: chosen } = await dialog.showSaveDialog(win, {
    defaultPath: filePath || state.filePath || suggestFileName(content),
    filters: FILE_FILTERS,
  })
  if (canceled || !chosen) return { ok: false, canceled: true }
  try {
    const result = await writeDocument(chosen, content)
    if (state.unwatch) state.unwatch()
    state.filePath = chosen
    state.dirty = false
    state.mtimeMs = result.mtimeMs
    state.unwatch = watchFile(chosen, ({ mtimeMs }) => {
      if (Math.abs(mtimeMs - (state.mtimeMs || 0)) < 2) return
      state.mtimeMs = mtimeMs
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.FILE_CHANGED_ON_DISK, { filePath: chosen })
      }
    })
    store.addRecent(chosen)
    app.addRecentDocument(chosen)
    refreshMenu()
    if (win) updateWindowTitle(win)
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function applyTheme(theme) {
  nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system'
}

function broadcastTheme() {
  const payload = { dark: nativeTheme.shouldUseDarkColors }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.THEME_CHANGED, payload)
  }
}

// macOS delivers double-clicked / dropped files here, often before ready.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (app.isReady()) {
    openPathInBestWindow(filePath)
  } else {
    pendingOpenPaths.push(filePath)
  }
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const fileArg = documentArgFrom(argv)
    if (fileArg) openPathInBestWindow(fileArg)
    else createWindow()
  })

  app.whenReady().then(() => {
    store = new Store(path.join(app.getPath('userData'), 'preferences.json'))
    applyTheme(store.get('theme'))
    nativeTheme.on('updated', broadcastTheme)
    applySpellCheckerSettings(session.defaultSession, {
      enabled: store.get('spellcheck') !== false,
      languages: store.get('spellcheckLanguages'),
    })

    registerIpc()
    refreshMenu()

    const initial = pendingOpenPaths.shift() || documentArgFrom(process.argv)
    createWindow(initial)
    for (const extra of pendingOpenPaths) createWindow(extra)
    pendingOpenPaths.length = 0

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    store?.flush()
    if (!isMac) app.quit()
  })

  app.on('before-quit', () => store?.flush())
}
