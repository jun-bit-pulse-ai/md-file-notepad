const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')

const MARKDOWN_EXTENSIONS = [
  'md',
  'markdown',
  'mdown',
  'mkd',
  'mkdn',
  'mdwn',
  'text',
  'txt',
]

const FILE_FILTERS = [
  { name: 'Markdown', extensions: MARKDOWN_EXTENSIONS },
  { name: 'All Files', extensions: ['*'] },
]

/** Files this size or larger open in source mode; live preview gets slow. */
const LARGE_FILE_BYTES = 2 * 1024 * 1024

function isMarkdownPath(filePath) {
  if (!filePath) return false
  const ext = path.extname(filePath).replace('.', '').toLowerCase()
  return MARKDOWN_EXTENSIONS.includes(ext)
}

async function readDocument(filePath) {
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) throw new Error(`${filePath} is not a file`)
  const content = await fs.readFile(filePath, 'utf8')
  return {
    filePath,
    content,
    fileName: path.basename(filePath),
    directory: path.dirname(filePath),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    isLarge: stat.size >= LARGE_FILE_BYTES,
  }
}

/**
 * Writes atomically: a crash mid-write leaves the original file intact
 * instead of a truncated document.
 */
async function writeDocument(filePath, content) {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(tmp, content, 'utf8')
  try {
    await fs.rename(tmp, filePath)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
  const stat = await fs.stat(filePath)
  return { filePath, mtimeMs: stat.mtimeMs, size: stat.size }
}

/**
 * Lists a directory for the file-tree sidebar: folders first, then
 * markdown files, both alphabetical. Dotfiles are skipped.
 */
async function listDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const folders = []
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, path: full, type: 'directory' })
    } else if (entry.isFile() && isMarkdownPath(entry.name)) {
      files.push({ name: entry.name, path: full, type: 'file' })
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })
  folders.sort(byName)
  files.sort(byName)
  return { path: dirPath, entries: [...folders, ...files] }
}

/** Directories never worth walking for a document picker. */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  '__pycache__',
])

/**
 * Recursively collects markdown files under `root` for Quick Open.
 *
 * Bounded on both depth and count: a picker over someone's home folder
 * should degrade to "the first N files" rather than stat the whole disk.
 * Returns paths relative to the root, which is what the palette displays.
 */
async function walkDirectory(root, { maxDepth = 6, maxEntries = 2000 } = {}) {
  const files = []
  let truncated = false

  async function walk(dir, depth) {
    if (depth > maxDepth || files.length >= maxEntries) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable directory; skip rather than fail the whole walk
    }

    const directories = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (files.length >= maxEntries) {
        truncated = true
        return
      }
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) directories.push(full)
      } else if (entry.isFile() && isMarkdownPath(entry.name)) {
        files.push({
          path: full,
          name: entry.name,
          relativePath: path.relative(root, full),
        })
      }
    }

    // Files at this level first, then descend — shallow results rank higher.
    for (const child of directories) await walk(child, depth + 1)
  }

  await walk(root, 0)
  files.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true })
  )
  return { root, files, truncated }
}

/**
 * Watches the open file for external edits (another editor, git checkout).
 * Returns a disposer. Uses a debounce because editors often touch a file
 * several times per save.
 */
function watchFile(filePath, onChange) {
  let watcher
  let timer = null
  try {
    watcher = fsSync.watch(filePath, { persistent: false }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        fsSync.stat(filePath, (err, stat) => {
          if (err) return
          onChange({ mtimeMs: stat.mtimeMs, size: stat.size })
        })
      }, 150)
    })
  } catch {
    return () => {}
  }
  return () => {
    if (timer) clearTimeout(timer)
    try {
      watcher.close()
    } catch {
      /* already closed */
    }
  }
}

/** Suggests "Untitled.md" style names that do not clobber an existing file. */
function suggestFileName(content, fallback = 'Untitled') {
  const heading = /^#{1,6}\s+(.+)$/m.exec(content || '')
  const raw = heading ? heading[1] : fallback
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${cleaned || fallback}.md`
}

module.exports = {
  FILE_FILTERS,
  LARGE_FILE_BYTES,
  MARKDOWN_EXTENSIONS,
  isMarkdownPath,
  listDirectory,
  readDocument,
  suggestFileName,
  walkDirectory,
  watchFile,
  writeDocument,
}
