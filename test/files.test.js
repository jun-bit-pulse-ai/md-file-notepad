const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  isMarkdownPath,
  listDirectory,
  readDocument,
  suggestFileName,
  writeDocument,
  LARGE_FILE_BYTES,
} = require('../src/main/files.js')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-test-'))
}

test('recognises markdown extensions', () => {
  assert.equal(isMarkdownPath('notes.md'), true)
  assert.equal(isMarkdownPath('NOTES.MARKDOWN'), true)
  assert.equal(isMarkdownPath('/a/b/readme.mkd'), true)
  assert.equal(isMarkdownPath('image.png'), false)
  assert.equal(isMarkdownPath(''), false)
  assert.equal(isMarkdownPath(null), false)
})

test('round-trips a document through disk', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'note.md')
  await writeDocument(file, '# Hello\n')

  const doc = await readDocument(file)
  assert.equal(doc.content, '# Hello\n')
  assert.equal(doc.fileName, 'note.md')
  assert.equal(doc.directory, dir)
  assert.equal(doc.isLarge, false)
  assert.ok(doc.mtimeMs > 0)
})

test('writes create missing directories', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'nested', 'deep', 'note.md')
  await writeDocument(file, 'content')
  assert.equal(fs.readFileSync(file, 'utf8'), 'content')
})

test('writing leaves no temporary files behind', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'note.md')
  await writeDocument(file, 'one')
  await writeDocument(file, 'two')

  assert.equal(fs.readFileSync(file, 'utf8'), 'two')
  assert.deepEqual(fs.readdirSync(dir), ['note.md'])
})

test('overwriting preserves content when the new write succeeds', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'note.md')
  await writeDocument(file, 'first version')
  const result = await writeDocument(file, 'second version')

  assert.equal(fs.readFileSync(file, 'utf8'), 'second version')
  assert.equal(result.filePath, file)
  assert.equal(result.size, Buffer.byteLength('second version'))
})

test('reading a directory rather than a file fails loudly', async () => {
  const dir = tempDir()
  await assert.rejects(() => readDocument(dir))
})

test('large files are flagged so the UI can fall back to source mode', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'big.md')
  fs.writeFileSync(file, 'x'.repeat(LARGE_FILE_BYTES + 1))
  const doc = await readDocument(file)
  assert.equal(doc.isLarge, true)
})

test('listDirectory returns folders first, then markdown files', async () => {
  const dir = tempDir()
  fs.mkdirSync(path.join(dir, 'zebra-folder'))
  fs.mkdirSync(path.join(dir, 'alpha-folder'))
  fs.writeFileSync(path.join(dir, 'b.md'), '')
  fs.writeFileSync(path.join(dir, 'a.md'), '')

  const { entries } = await listDirectory(dir)
  assert.deepEqual(
    entries.map((e) => e.name),
    ['alpha-folder', 'zebra-folder', 'a.md', 'b.md']
  )
  assert.equal(entries[0].type, 'directory')
  assert.equal(entries[2].type, 'file')
})

test('listDirectory hides dotfiles and non-markdown files', async () => {
  const dir = tempDir()
  fs.writeFileSync(path.join(dir, '.hidden.md'), '')
  fs.writeFileSync(path.join(dir, 'photo.png'), '')
  fs.writeFileSync(path.join(dir, 'visible.md'), '')

  const { entries } = await listDirectory(dir)
  assert.deepEqual(
    entries.map((e) => e.name),
    ['visible.md']
  )
})

test('listDirectory sorts numerically, not lexically', async () => {
  const dir = tempDir()
  for (const name of ['note10.md', 'note2.md', 'note1.md']) {
    fs.writeFileSync(path.join(dir, name), '')
  }
  const { entries } = await listDirectory(dir)
  assert.deepEqual(
    entries.map((e) => e.name),
    ['note1.md', 'note2.md', 'note10.md']
  )
})

test('suggestFileName derives a name from the first heading', () => {
  assert.equal(suggestFileName('# Meeting Notes\n\nbody'), 'Meeting Notes.md')
  assert.equal(suggestFileName('### Deep Heading'), 'Deep Heading.md')
})

test('suggestFileName strips characters that are illegal in filenames', () => {
  assert.equal(suggestFileName('# A/B: test?'), 'AB test.md')
})

test('suggestFileName falls back when there is no heading', () => {
  assert.equal(suggestFileName('just prose'), 'Untitled.md')
  assert.equal(suggestFileName(''), 'Untitled.md')
})

test('suggestFileName caps very long headings', () => {
  const name = suggestFileName(`# ${'word '.repeat(40)}`)
  assert.ok(name.length <= 83, `expected a bounded name, got ${name.length} chars`)
})
