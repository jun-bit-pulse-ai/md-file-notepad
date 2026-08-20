const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { Store, DEFAULTS, MAX_RECENT } = require('../src/main/store.js')

function tempFile(name = 'prefs.json') {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-store-')), name)
}

test('a missing file yields defaults', () => {
  const store = new Store(tempFile())
  assert.equal(store.get('theme'), DEFAULTS.theme)
  assert.deepEqual(store.get('recentFiles'), [])
})

test('a corrupt file falls back to defaults instead of throwing', () => {
  const file = tempFile()
  fs.writeFileSync(file, '{ not json at all')
  const store = new Store(file)
  assert.equal(store.get('fontSize'), DEFAULTS.fontSize)
})

test('unknown keys in a stored file are preserved alongside defaults', () => {
  const file = tempFile()
  fs.writeFileSync(file, JSON.stringify({ theme: 'dark', somethingNew: 42 }))
  const store = new Store(file)
  assert.equal(store.get('theme'), 'dark')
  assert.equal(store.get('somethingNew'), 42)
  assert.equal(store.get('fontSize'), DEFAULTS.fontSize)
})

test('set writes through and persists on flush', () => {
  const file = tempFile()
  const store = new Store(file)
  store.set('theme', 'dark')
  store.set({ fontSize: 20, focusMode: true })
  store.flush()

  const reloaded = new Store(file)
  assert.equal(reloaded.get('theme'), 'dark')
  assert.equal(reloaded.get('fontSize'), 20)
  assert.equal(reloaded.get('focusMode'), true)
})

test('recent files are most-recent-first and de-duplicated', () => {
  const store = new Store(tempFile())
  store.addRecent('/a.md')
  store.addRecent('/b.md')
  store.addRecent('/a.md')
  assert.deepEqual(store.get('recentFiles'), ['/a.md', '/b.md'])
})

test('the recent list is capped', () => {
  const store = new Store(tempFile())
  for (let i = 0; i < MAX_RECENT + 10; i++) store.addRecent(`/file-${i}.md`)
  assert.equal(store.get('recentFiles').length, MAX_RECENT)
  assert.equal(store.get('recentFiles')[0], `/file-${MAX_RECENT + 9}.md`)
})

test('addRecent ignores empty paths', () => {
  const store = new Store(tempFile())
  store.addRecent('')
  store.addRecent(null)
  assert.deepEqual(store.get('recentFiles'), [])
})

test('pruneRecent drops files that no longer exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-prune-'))
  const real = path.join(dir, 'real.md')
  fs.writeFileSync(real, '')

  const store = new Store(tempFile())
  store.addRecent(real)
  store.addRecent(path.join(dir, 'gone.md'))

  assert.deepEqual(store.pruneRecent(), [real])
})

test('clearRecent empties the list', () => {
  const store = new Store(tempFile())
  store.addRecent('/a.md')
  store.clearRecent()
  assert.deepEqual(store.get('recentFiles'), [])
})

test('a non-array recentFiles value is repaired on load', () => {
  const file = tempFile()
  fs.writeFileSync(file, JSON.stringify({ recentFiles: 'oops' }))
  const store = new Store(file)
  assert.deepEqual(store.get('recentFiles'), [])
})

test('get with no argument returns the whole object', () => {
  const store = new Store(tempFile())
  assert.equal(typeof store.get(), 'object')
  assert.equal(store.get().theme, DEFAULTS.theme)
})

test('an unwritable path does not throw on flush', () => {
  // A regular file standing where a directory should be: mkdir fails with
  // ENOTDIR, which is the realistic "cannot persist" case.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-ro-'))
  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, '')

  const store = new Store(path.join(blocker, 'prefs.json'))
  store.set('theme', 'dark')
  assert.doesNotThrow(() => store.flush())
  // The in-memory value still updates so the UI stays responsive.
  assert.equal(store.get('theme'), 'dark')
})
