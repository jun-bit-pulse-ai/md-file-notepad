import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import {
  detectImageType,
  inlineRuns,
  markdownToDocx,
  parseBlocks,
  resolveImages,
  scaleImage,
} from '../src/renderer/lib/docx.js'

const typesOf = (blocks) => blocks.map((b) => b.type)
const textOf = (runs) => runs.map((r) => r.text).join('')

/* ------------------------------- structure ------------------------------ */

test('headings keep their level and text', () => {
  const blocks = parseBlocks('# One\n\n### Three')
  assert.deepEqual(typesOf(blocks), ['heading', 'heading'])
  assert.equal(blocks[0].level, 1)
  assert.equal(blocks[1].level, 3)
  assert.equal(textOf(blocks[1].runs), 'Three')
})

test('paragraphs carry inline formatting per run', () => {
  const [para] = parseBlocks('Plain **bold** and *italic* and ~~gone~~.')
  const styled = Object.fromEntries(
    para.runs.filter((r) => r.bold || r.italic || r.strike).map((r) => [r.text, r])
  )
  assert.equal(styled.bold.bold, true)
  assert.equal(styled.italic.italic, true)
  assert.equal(styled.gone.strike, true)
})

test('nested emphasis applies both styles', () => {
  const [para] = parseBlocks('**bold *and italic* here**')
  const both = para.runs.find((r) => r.bold && r.italic)
  assert.ok(both, 'expected a run that is both bold and italic')
  assert.equal(both.text, 'and italic')
})

test('inline code and highlight are marked', () => {
  const [para] = parseBlocks('Run `npm test` and ==note this==.')
  assert.equal(para.runs.find((r) => r.code)?.text, 'npm test')
  assert.equal(para.runs.find((r) => r.highlight)?.text, 'note this')
})

test('links keep their target on every run they cover', () => {
  const [para] = parseBlocks('See [the **docs**](https://example.com/x).')
  const linked = para.runs.filter((r) => r.link)
  assert.ok(linked.length >= 1)
  assert.ok(linked.every((r) => r.link === 'https://example.com/x'))
  assert.equal(textOf(linked), 'the docs')
})

test('bullet lists become list items at the right level', () => {
  const blocks = parseBlocks('- one\n- two\n  - nested')
  const items = blocks.filter((b) => b.type === 'list-item')
  assert.equal(items.length, 3)
  assert.deepEqual(
    items.map((i) => i.level),
    [0, 0, 1]
  )
  assert.ok(items.every((i) => i.ordered === false))
})

test('ordered lists are marked ordered', () => {
  const items = parseBlocks('1. one\n2. two').filter((b) => b.type === 'list-item')
  assert.equal(items.length, 2)
  assert.ok(items.every((i) => i.ordered === true))
})

test('separate ordered lists get separate numbering instances', () => {
  const items = parseBlocks('1. a\n2. b\n\ntext\n\n1. c\n2. d').filter(
    (b) => b.type === 'list-item'
  )
  assert.notEqual(items[0].instance, items[3].instance)
})

test('task items record their checked state', () => {
  const items = parseBlocks('- [x] done\n- [ ] open\n- plain').filter(
    (b) => b.type === 'list-item'
  )
  assert.deepEqual(
    items.map((i) => i.checked),
    [true, false, null]
  )
})

test('the checkbox markup is not duplicated into the text', () => {
  const [item] = parseBlocks('- [x] finish it').filter((b) => b.type === 'list-item')
  assert.equal(textOf(item.runs).trim(), 'finish it')
})

test('blockquotes flag their paragraphs', () => {
  const blocks = parseBlocks('> quoted text')
  assert.equal(blocks[0].type, 'paragraph')
  assert.equal(blocks[0].quote, true)
})

test('fenced code keeps its language and body verbatim', () => {
  const [code] = parseBlocks('```js\nconst a = 1\nconst b = 2\n```')
  assert.equal(code.type, 'code')
  assert.equal(code.language, 'js')
  assert.equal(code.code, 'const a = 1\nconst b = 2')
})

test('markdown inside a code block is not interpreted', () => {
  const [code] = parseBlocks('```\n# not a heading\n**not bold**\n```')
  assert.equal(code.type, 'code')
  assert.match(code.code, /# not a heading/)
})

test('horizontal rules become their own block', () => {
  assert.deepEqual(typesOf(parseBlocks('a\n\n---\n\nb')), [
    'paragraph',
    'hr',
    'paragraph',
  ])
})

test('tables capture header, rows and alignment', () => {
  const [table] = parseBlocks(
    '| Left | Mid | Right |\n| :--- | :-: | ----: |\n| a | b | c |\n| d | e | f |'
  )
  assert.equal(table.type, 'table')
  assert.deepEqual(table.header[0].map(textOf), ['Left', 'Mid', 'Right'])
  assert.equal(table.rows.length, 2)
  assert.deepEqual(table.rows[1].map(textOf), ['d', 'e', 'f'])
  assert.deepEqual(table.alignments, ['left', 'center', 'right'])
})

test('a standalone image becomes an image block', () => {
  const [block] = parseBlocks('![a cat](cat.png)')
  assert.equal(block.type, 'image')
  assert.equal(block.src, 'cat.png')
  assert.equal(block.alt, 'a cat')
})

test('display math is preserved as source', () => {
  const blocks = parseBlocks('$$\nx = y\n$$')
  const math = blocks.find((b) => b.type === 'code')
  assert.ok(math, 'expected math to survive as a code block')
  assert.match(math.code, /x = y/)
})

test('an empty document yields no blocks', () => {
  assert.deepEqual(parseBlocks(''), [])
  assert.deepEqual(parseBlocks(undefined), [])
})

test('inlineRuns tolerates missing children', () => {
  assert.deepEqual(inlineRuns(undefined), [])
  assert.deepEqual(inlineRuns([]), [])
})

/* --------------------------------- images -------------------------------- */

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

test('image formats are sniffed from magic bytes', () => {
  assert.equal(detectImageType(PNG_BYTES), 'png')
  assert.equal(detectImageType(JPG_BYTES), 'jpg')
  assert.equal(detectImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38])), 'gif')
  assert.equal(detectImageType(new Uint8Array([1, 2, 3, 4])), null)
  assert.equal(detectImageType(new Uint8Array([1])), null)
  assert.equal(detectImageType(null), null)
})

test('oversized images scale down proportionally', () => {
  const scaled = scaleImage(1200, 600, 6)
  assert.equal(scaled.width, 576)
  assert.equal(scaled.height, 288)
})

test('images that already fit are left alone', () => {
  assert.deepEqual(scaleImage(300, 150, 6), { width: 300, height: 150 })
})

test('resolveImages embeds bytes for loadable images', async () => {
  const blocks = await resolveImages(parseBlocks('![pic](pic.png)'), async () => ({
    data: PNG_BYTES,
    width: 100,
    height: 50,
  }))
  assert.equal(blocks[0].type, 'image')
  assert.equal(blocks[0].imageType, 'png')
  assert.deepEqual(blocks[0].data, PNG_BYTES)
})

test('an unloadable image degrades to a caption instead of vanishing', async () => {
  const blocks = await resolveImages(
    parseBlocks('![missing](nope.png)'),
    async () => null
  )
  assert.equal(blocks[0].type, 'paragraph')
  assert.match(textOf(blocks[0].runs), /\[image: missing\]/)
})

test('a loader that throws is handled the same way', async () => {
  const blocks = await resolveImages(parseBlocks('![boom](x.png)'), async () => {
    throw new Error('read failed')
  })
  assert.equal(blocks[0].type, 'paragraph')
})

test('unrecognised image data degrades rather than corrupting the file', async () => {
  const blocks = await resolveImages(parseBlocks('![odd](x.tiff)'), async () => ({
    data: new Uint8Array([9, 9, 9, 9]),
    width: 10,
    height: 10,
  }))
  assert.equal(blocks[0].type, 'paragraph')
})

/* ------------------------------ end to end ------------------------------- */

const SAMPLE = [
  '# Report',
  '',
  'Some **bold** and a [link](https://example.com).',
  '',
  '- [x] done',
  '- [ ] todo',
  '',
  '1. first',
  '2. second',
  '',
  '> quoted',
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  '| Feature | Done |',
  '| ------- | :--: |',
  '| Export  | Yes  |',
  '',
  '---',
].join('\n')

async function buildAndUnzip(markdown) {
  const buffer = await markdownToDocx(markdown, { title: 'Report' })
  const zip = await JSZip.loadAsync(Buffer.from(buffer))
  return {
    zip,
    document: await zip.file('word/document.xml').async('string'),
  }
}

test('the exported file is a valid Word package', async () => {
  const { zip } = await buildAndUnzip(SAMPLE)
  for (const entry of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']) {
    assert.ok(zip.file(entry), `expected ${entry} in the package`)
  }
})

test('exported content includes the document text', async () => {
  const { document } = await buildAndUnzip(SAMPLE)
  for (const text of ['Report', 'second', 'quoted', 'Export']) {
    assert.ok(document.includes(text), `expected "${text}" in the document`)
  }
})

test('exported formatting maps onto Word features', async () => {
  const { document } = await buildAndUnzip(SAMPLE)
  assert.match(document, /w:pStyle w:val="Heading1"/, 'headings use Word heading styles')
  assert.match(document, /<w:b\b/, 'bold survives')
  assert.match(document, /w:hyperlink/, 'links become real hyperlinks')
  assert.match(document, /w:numPr/, 'ordered lists use numbering')
  assert.match(document, /<w:tbl>/, 'tables become Word tables')
  assert.match(document, /w:pBdr/, 'quotes and rules use borders')
  assert.ok(document.includes('☒') && document.includes('☐'), 'task state is visible')
})

test('ordered lists ship a numbering definition', async () => {
  const { zip } = await buildAndUnzip('1. one\n2. two')
  assert.ok(zip.file('word/numbering.xml'), 'expected numbering.xml')
})

test('an empty document still produces a valid file', async () => {
  const { zip, document } = await buildAndUnzip('')
  assert.ok(zip.file('word/document.xml'))
  assert.match(document, /<w:body>/)
})

test('export does not throw on documents with images', async () => {
  const buffer = await markdownToDocx('![x](missing.png)\n\ntext', { title: 'T' })
  assert.ok(buffer.byteLength > 0)
})
