const { contextBridge, ipcRenderer } = require('electron')
const { IPC } = require('../shared/ipc.js')

/**
 * The renderer runs with contextIsolation on and nodeIntegration off, so
 * this is the entire surface it can reach. Every method is an explicit,
 * narrow operation rather than a generic "run this in main" escape hatch.
 */
const api = {
  platform: process.platform,

  newFile: () => ipcRenderer.invoke(IPC.FILE_NEW),
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  openPath: (filePath) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, filePath),
  readFile: (filePath) => ipcRenderer.invoke(IPC.FILE_READ, filePath),
  save: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE, payload),
  saveAs: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload),
  exportHtml: (payload) => ipcRenderer.invoke(IPC.FILE_EXPORT_HTML, payload),
  exportPdf: (payload) => ipcRenderer.invoke(IPC.FILE_EXPORT_PDF, payload),
  revealInFinder: (filePath) => ipcRenderer.invoke(IPC.FILE_REVEAL, filePath),
  listDirectory: (dirPath) => ipcRenderer.invoke(IPC.FILE_LIST_DIR, dirPath),

  recentFiles: () => ipcRenderer.invoke(IPC.RECENT_LIST),
  clearRecentFiles: () => ipcRenderer.invoke(IPC.RECENT_CLEAR),

  getPrefs: () => ipcRenderer.invoke(IPC.PREFS_GET),
  setPrefs: (patch) => ipcRenderer.invoke(IPC.PREFS_SET, patch),

  /** Tells main about dirty state / path so it can title the window. */
  reportDocumentState: (state) => ipcRenderer.send(IPC.DOC_STATE, state),
  confirmDiscard: (fileName) => ipcRenderer.invoke(IPC.CONFIRM_DISCARD, fileName),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),

  /** Answers a one-shot reply channel handed to us by the main process. */
  replyToMain: (channel, value) => {
    if (typeof channel === 'string' && channel.startsWith(IPC.REQUEST_SAVE)) {
      ipcRenderer.send(channel, value)
    }
  },

  onMenuCommand: (handler) => subscribe(IPC.MENU_COMMAND, handler),
  onLoadDocument: (handler) => subscribe(IPC.LOAD_DOCUMENT, handler),
  onRequestSave: (handler) => subscribe(IPC.REQUEST_SAVE, handler),
  onThemeChanged: (handler) => subscribe(IPC.THEME_CHANGED, handler),
  onFileChangedOnDisk: (handler) => subscribe(IPC.FILE_CHANGED_ON_DISK, handler),
}

function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('notepad', api)
