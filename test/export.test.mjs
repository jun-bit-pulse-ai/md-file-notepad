import test from 'node:test'
import assert from 'node:assert/strict'

import { EXPORT_CSS, buildHtmlDocument, escapeHtml } from '../src/renderer/lib/export.js'

const SAMPLE = [
  '# Report',
  '',
  'A paragraph with **bold** text and a [link](https://example.com).',
  '',
  '- one',
  '- two',
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  '> quoted',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
].join('\n')

const styleBlocks = (html) => html.match(/<style>/g) ?? []

/* ------------------------------- escapeHtml ----------------------------- */

test('escapeHtml neutralises the four characters that can break markup', () => {
  assert.equal(escapeHtml('a & b <c> "d"'), 'a &amp; b &lt;c&gt; &quot;d&quot;')
})

test('escapeHtml escapes the ampersand first so entities are not doubled', () => {
  assert.equal(escapeHtml('<'), '&lt;')
  assert.equal(escapeHtml('&amp;'), '&amp;amp;')
})

test('escapeHtml leaves an already safe string untouched', () => {
  assert.equal(escapeHtml('plain title 42'), 'plain title 42')
})

test('escapeHtml coerces non-string input rather than throwing', () => {
  assert.equal(escapeHtml(42), '42')
  assert.equal(escapeHtml(null), 'null')
  assert.equal(escapeHtml(undefined), 'undefined')
})

/* ---------------------------- document shell ---------------------------- */

test('the exported document is a complete standalone HTML file', () => {
  const html = buildHtmlDocument(SAMPLE, { title: 'Report' })
  assert.ok(html.startsWith('<!doctype html>'), 'starts with a doctype')
  assert.match(html, /<html lang="en">/)
  assert.match(html, /<meta charset="utf-8">/)
  assert.match(
    html,
    /<meta name="viewport" content="width=device-width, initial-scale=1">/
  )
  assert.ok(html.trimEnd().endsWith('</html>'), 'closes the html element')
})

test('the document head comes before the body content', () => {
  const html = buildHtmlDocument('# Heading', { title: 'T' })
  assert.ok(html.indexOf('</head>') < html.indexOf('<h1'), 'head closes before content')
})

/* --------------------------------- title -------------------------------- */

test('the title given by the caller becomes the document title', () => {
  const html = buildHtmlDocument('text', { title: 'Meeting Notes' })
  assert.match(html, /<title>Meeting Notes<\/title>/)
})

test('a document exported with no options falls back to Untitled', () => {
  assert.match(buildHtmlDocument('text'), /<title>Untitled<\/title>/)
})

test('a title is escaped so a filename cannot inject markup into the head', () => {
  const html = buildHtmlDocument('text', { title: 'a & b <script>' })
  assert.match(html, /<title>a &amp; b &lt;script&gt;<\/title>/)
  assert.ok(!html.includes('<script'), 'no script tag reaches the output')
})

test('the katexCss option alone still leaves the title defaulted', () => {
  const html = buildHtmlDocument('text', { katexCss: '.katex { color: red }' })
  assert.match(html, /<title>Untitled<\/title>/)
})

/* -------------------------------- styles -------------------------------- */

test('the export stylesheet is inlined rather than linked', () => {
  const html = buildHtmlDocument(SAMPLE, { title: 'Report' })
  assert.ok(html.includes(EXPORT_CSS), 'the full stylesheet is embedded verbatim')
  assert.ok(!html.includes('<link'), 'nothing is loaded from outside the file')
})

test('a document with no katex css carries a single style block', () => {
  assert.equal(styleBlocks(buildHtmlDocument('text')).length, 1)
})

test('katex css passed in by the caller is inlined as a second style block', () => {
  const katexCss = '.katex { font-family: KaTeX_Main }'
  const html = buildHtmlDocument('$x^2$', { katexCss })
  assert.equal(styleBlocks(html).length, 2)
  assert.ok(html.includes(katexCss), 'the caller stylesheet is embedded verbatim')
  assert.ok(
    html.indexOf(katexCss) > html.indexOf(EXPORT_CSS),
    'katex css comes last so it can override the export defaults'
  )
})

test('the stylesheet carries print rules so the PDF path paginates sanely', () => {
  assert.match(EXPORT_CSS, /@media print/)
  assert.match(EXPORT_CSS, /break-inside: avoid/)
})

test('the stylesheet styles the constructs the renderer can emit', () => {
  for (const selector of [
    'pre',
    'blockquote',
    'table',
    'mark',
    '.math-block',
    '.footnotes',
  ]) {
    assert.ok(EXPORT_CSS.includes(selector), `expected a rule for ${selector}`)
  }
})

/* ------------------------------ body content ----------------------------- */

test('markdown is rendered into the body as HTML', () => {
  const html = buildHtmlDocument(SAMPLE, { title: 'Report' })
  assert.match(html, /<h1 id="report">Report<\/h1>/)
  assert.match(html, /<strong>bold<\/strong>/)
  assert.match(html, /<a href="https:\/\/example\.com"[^>]*>link<\/a>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<pre>/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /<table>/)
})

test('exported links open externally and cannot reach the opener', () => {
  const html = buildHtmlDocument('[docs](https://example.com)')
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /target="_blank"/)
})

test('headings get slug ids so exported anchor links resolve', () => {
  const html = buildHtmlDocument('## Getting Started')
  assert.match(html, /<h2 id="getting-started">Getting Started<\/h2>/)
})

test('math is rendered at export time instead of needing a script', () => {
  const html = buildHtmlDocument('$$x^2$$')
  assert.match(html, /class="katex/)
  assert.ok(!html.includes('<script'), 'no script is needed to display the math')
})

test('raw HTML in the source is escaped, not passed into the export', () => {
  const html = buildHtmlDocument('<img src=x onerror=alert(1)>\n\ntext')
  assert.ok(!html.includes('<img'), 'the tag does not survive as markup')
  assert.match(html, /&lt;img/)
})

test('an empty document still produces a valid file with an empty body', () => {
  const html = buildHtmlDocument('')
  assert.ok(html.startsWith('<!doctype html>'))
  assert.match(html, /<title>Untitled<\/title>/)
  assert.match(html, /<body>\s*<\/body>/)
})

test('a whitespace-only document is treated the same as an empty one', () => {
  assert.match(buildHtmlDocument('\n\n   \n'), /<body>\s*<\/body>/)
})

test('exporting the same markdown twice produces identical output', () => {
  const options = { title: 'Report', katexCss: '.katex { color: red }' }
  assert.equal(buildHtmlDocument(SAMPLE, options), buildHtmlDocument(SAMPLE, options))
})
