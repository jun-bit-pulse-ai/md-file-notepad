const fs = require('node:fs')
const path = require('node:path')

const DEFAULTS = {
  theme: 'system', // 'system' | 'light' | 'dark'
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  sidebar: 'closed', // 'closed' | 'outline' | 'files'
  fontSize: 16,
  editorWidth: 'normal', // 'narrow' | 'normal' | 'wide' | 'full'
  spellcheck: true,
  autosave: false,
  recentFiles: [],
  windowBounds: { width: 1080, height: 760 },
}

const MAX_RECENT = 15

/**
 * Tiny JSON-file preference store. Reads once at startup and writes
 * lazily; a corrupt or missing file falls back to defaults rather than
 * taking the app down on launch.
 */
class Store {
  constructor(filePath) {
    this.filePath = filePath
    this.data = { ...DEFAULTS }
    this.writeTimer = null
    this.load()
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        this.data = { ...DEFAULTS, ...parsed }
      }
    } catch {
      this.data = { ...DEFAULTS }
    }
    if (!Array.isArray(this.data.recentFiles)) this.data.recentFiles = []
    return this.data
  }

  get(key) {
    return key === undefined ? this.data : this.data[key]
  }

  set(key, value) {
    if (typeof key === 'object' && key !== null) {
      Object.assign(this.data, key)
    } else {
      this.data[key] = value
    }
    this.scheduleWrite()
    return this.data
  }

  addRecent(filePath) {
    if (!filePath) return this.data.recentFiles
    const next = [filePath, ...this.data.recentFiles.filter((p) => p !== filePath)]
    this.data.recentFiles = next.slice(0, MAX_RECENT)
    this.scheduleWrite()
    return this.data.recentFiles
  }

  /** Drops entries whose file no longer exists, so the menu stays honest. */
  pruneRecent() {
    this.data.recentFiles = this.data.recentFiles.filter((p) => {
      try {
        return fs.statSync(p).isFile()
      } catch {
        return false
      }
    })
    this.scheduleWrite()
    return this.data.recentFiles
  }

  clearRecent() {
    this.data.recentFiles = []
    this.scheduleWrite()
  }

  scheduleWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), 250)
  }

  flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
    } catch (err) {
      console.error('[store] failed to persist preferences:', err.message)
    }
  }
}

module.exports = { Store, DEFAULTS, MAX_RECENT }
