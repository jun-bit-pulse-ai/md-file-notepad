import test from 'node:test'
import assert from 'node:assert/strict'

import { md, renderInline, renderMarkdown } from '../src/renderer/lib/markdown.js'

/**
 * Pins the behaviour of the shared markdown renderer. Preview, HTML export
 * and PDF export all go through this one instance, so anything asserted here
 * is a promise about all three at once.
 *
 * The assertions deliberately describe what the module does rather than what
 * markdown-it does by default: four custom plugins and a link hook sit on top
 * of it, and `html` is off.
 */

const count = (haystack, needle) => haystack.split(needle).length - 1

// --- html: false -----------------------------------------------------------

test('block-level HTML in the source is escaped instead of passed through', () => {
  const html = renderMarkdown('<div class=danger>hi</div>')
  assert.equal(html.trim(), '<p>&lt;div class=danger&gt;hi&lt;/div&gt;</p>')
})

test('inline tags in the source are escaped rather than rendered', () => {
  assert.equal(
    renderMarkdown('a <b>bold</b> c').trim(),
    '<p>a &lt;b&gt;bold&lt;/b&gt; c</p>'
  )
})

test('a script tag in the source cannot reach the output as markup', () => {
  const html = renderMarkdown('<script>alert(1)</script>')
  assert.ok(!html.includes('<script'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
})

test('an event-handler attribute cannot reach the output as markup', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>')
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
})

test('an HTML comment is escaped like any other angle bracket', () => {
  assert.equal(renderMarkdown('<!-- hi -->').trim(), '<p>&lt;!-- hi --&gt;</p>')
})

test('a javascript: URL is rejected and left as plain text', () => {
  const html = renderMarkdown('[x](javascript:alert(1))')
  assert.ok(!html.includes('<a '))
  assert.ok(html.includes('javascript:alert(1)'))
})

test('the shared instance reports the options the module documents', () => {
  assert.equal(md.options.html, false)
  assert.equal(md.options.linkify, true)
  assert.equal(md.options.breaks, false)
  assert.equal(md.options.typographer, true)
})

// --- ==highlight== ---------------------------------------------------------

test('==text== becomes a mark element', () => {
  assert.equal(renderMarkdown('==wow==').trim(), '<p><mark>wow</mark></p>')
})

test('several highlights on one line are each marked', () => {
  const html = renderMarkdown('a ==one== and ==two== b')
  assert.equal(html.trim(), '<p>a <mark>one</mark> and <mark>two</mark> b</p>')
})

test('highlight content is escaped, so tags inside it stay inert', () => {
  const html = renderMarkdown('==<b>x</b>==')
  assert.equal(html.trim(), '<p><mark>&lt;b&gt;x&lt;/b&gt;</mark></p>')
})

test('highlight content is emitted as literal text, not parsed as markdown', () => {
  assert.equal(renderMarkdown('==**b** text==').trim(), '<p><mark>**b** text</mark></p>')
})

test('an unclosed == is left as literal text', () => {
  assert.equal(renderMarkdown('==wow').trim(), '<p>==wow</p>')
})

test('a whitespace-only highlight is not a highlight', () => {
  assert.equal(renderMarkdown('==  ==').trim(), '<p>==  ==</p>')
})

test('a run of equals signs with nothing between them is left alone', () => {
  assert.equal(renderMarkdown('====').trim(), '<p>====</p>')
})

test('highlight is not applied inside a code span', () => {
  assert.equal(renderMarkdown('x `==y==` z').trim(), '<p>x <code>==y==</code> z</p>')
})

test('highlight is not applied inside a fenced code block', () => {
  const html = renderMarkdown('```\n==y==\n```')
  assert.ok(html.includes('<code>==y==\n</code>'))
  assert.ok(!html.includes('<mark>'))
})

test('highlight does not reach across a blank line into the next paragraph', () => {
  const html = renderMarkdown('==a\n\nb==')
  assert.ok(!html.includes('<mark>'))
  assert.equal(html.trim(), '<p>==a</p>\n<p>b==</p>')
})

test('highlight nests inside emphasis', () => {
  assert.equal(
    renderMarkdown('*em ==a== em*').trim(),
    '<p><em>em <mark>a</mark> em</em></p>'
  )
})

test('highlight works inside a heading alongside the anchor id', () => {
  assert.equal(
    renderMarkdown('## ==Marked==').trim(),
    '<h2 id="marked"><mark>Marked</mark></h2>'
  )
})

// --- math via KaTeX --------------------------------------------------------

test('inline $...$ is rendered by KaTeX inside a math-inline span', () => {
  const html = renderMarkdown('see $x^2$ here')
  assert.ok(html.includes('<span class="math math-inline">'))
  assert.ok(html.includes('class="katex"'))
  assert.ok(!html.includes('katex-display'))
})

test('a lone dollar amount does not open inline math', () => {
  assert.equal(renderMarkdown('costs $12.00 total').trim(), '<p>costs $12.00 total</p>')
})

test('inline math does not span a line break', () => {
  const html = renderMarkdown('a $x\nb$ c')
  assert.ok(!html.includes('math-inline'))
  assert.ok(html.includes('$x'))
})

test('a backslash-escaped dollar does not close inline math', () => {
  const html = renderMarkdown('$a \\$ b$')
  assert.equal(count(html, 'math math-inline'), 1)
})

test('a dollar pair with only whitespace between them is not math', () => {
  assert.equal(renderMarkdown('$ $').trim(), '<p>$ $</p>')
})

test('$$...$$ on its own lines renders a display-mode math block', () => {
  const html = renderMarkdown('$$\na^2 + b^2\n$$')
  assert.ok(html.startsWith('<div class="math math-block">'))
  assert.ok(html.includes('katex-display'))
})

test('a single-line $$x$$ is still treated as a math block', () => {
  const html = renderMarkdown('$$x+y$$')
  assert.ok(html.startsWith('<div class="math math-block">'))
  assert.ok(html.includes('katex-display'))
})

test('an unterminated $$ block falls back to an ordinary paragraph', () => {
  const html = renderMarkdown('$$\nx+y')
  assert.ok(!html.includes('math-block'))
  assert.equal(html.trim(), '<p>$$\nx+y</p>')
})

test('a math block is allowed inside a list item', () => {
  const html = renderMarkdown('- item\n\n  $$\n  x\n  $$')
  assert.ok(html.includes('<li>'))
  assert.ok(html.includes('<div class="math math-block">'))
})

test('invalid LaTeX renders a katex-error span instead of throwing', () => {
  const html = renderMarkdown('$\\frac{$')
  assert.ok(html.includes('class="katex-error"'))
  assert.ok(html.includes('ParseError'))
})

test('math is not interpreted inside a code span', () => {
  assert.equal(renderMarkdown('`$x$`').trim(), '<p><code>$x$</code></p>')
})

test('math is not interpreted inside a fenced code block', () => {
  const html = renderMarkdown('```\n$x$\n```')
  assert.ok(!html.includes('math-inline'))
  assert.ok(html.includes('<code>$x$\n</code>'))
})

// --- task lists ------------------------------------------------------------

test('- [ ] renders a disabled unchecked checkbox on a task-item', () => {
  const html = renderMarkdown('- [ ] todo')
  assert.ok(html.includes('<li class="task-item">'))
  assert.ok(html.includes('<input class="task-checkbox" type="checkbox" disabled> todo'))
})

test('- [x] marks the item done and checks the box', () => {
  const html = renderMarkdown('- [x] done')
  assert.ok(html.includes('<li class="task-item task-done">'))
  assert.ok(html.includes('type="checkbox" disabled checked>'))
})

test('an uppercase [X] counts as checked', () => {
  assert.ok(renderMarkdown('- [X] done').includes('disabled checked>'))
})

test('the bracket marker is stripped from the rendered item text', () => {
  const html = renderMarkdown('- [x] done')
  assert.ok(!html.includes('[x]'))
})

test('the rest of the item is still parsed as markdown after the checkbox', () => {
  const html = renderMarkdown('- [x] see [me](https://e.com)')
  assert.ok(html.includes('disabled checked> see <a href="https://e.com"'))
})

test('a marker with no whitespace after it is not a checkbox', () => {
  const html = renderMarkdown('- [x]nospace')
  assert.ok(!html.includes('task-checkbox'))
  assert.ok(html.includes('<li>[x]nospace</li>'))
})

test('a bracket pair in the middle of an item is left alone', () => {
  const html = renderMarkdown('- see [ ] mid')
  assert.ok(!html.includes('task-checkbox'))
  assert.ok(html.includes('<li>see [ ] mid</li>'))
})

test('ordered list items get checkboxes too', () => {
  const html = renderMarkdown('1. [x] done')
  assert.ok(html.includes('<ol>'))
  assert.ok(html.includes('<li class="task-item task-done">'))
})

test('a nested task list gets its own checkbox', () => {
  const html = renderMarkdown('- [ ] a\n  - [x] b')
  assert.equal(count(html, 'task-checkbox'), 2)
  assert.equal(count(html, 'task-done'), 1)
})

test('the checkbox the plugin injects survives html being off', () => {
  const html = renderMarkdown('- [ ] todo')
  assert.ok(html.includes('<input class="task-checkbox"'))
  assert.ok(!html.includes('&lt;input'))
})

// --- heading anchors -------------------------------------------------------

test('a heading gets an id slugified from its text', () => {
  assert.equal(
    renderMarkdown('# Hello World').trim(),
    '<h1 id="hello-world">Hello World</h1>'
  )
})

test('punctuation is dropped from the heading slug', () => {
  const html = renderMarkdown('## Lets Go! (v2)')
  assert.ok(html.includes('<h2 id="lets-go-v2">'))
})

test('a heading with no sluggable characters gets no id at all', () => {
  assert.equal(renderMarkdown('### ???').trim(), '<h3>???</h3>')
})

test('inline code in a heading contributes its text to the slug', () => {
  const html = renderMarkdown('# `code` here')
  assert.ok(html.includes('<h1 id="code-here">'))
  assert.ok(html.includes('<code>code</code>'))
})

test('unicode letters are kept in the heading slug', () => {
  assert.ok(renderMarkdown('# Café Über').includes('id="café-über"'))
})

test('markup in the heading text cannot leak into the id attribute', () => {
  const html = renderMarkdown('# <img src=x onerror=y>')
  assert.ok(!html.includes('id='))
  assert.ok(html.includes('&lt;img src=x onerror=y&gt;'))
})

// --- links -----------------------------------------------------------------

test('an http link opens in a new tab with noopener and noreferrer', () => {
  const html = renderMarkdown('[x](https://example.com)')
  assert.equal(
    html.trim(),
    '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a></p>'
  )
})

test('a relative link is left without a target', () => {
  assert.equal(renderMarkdown('[x](./a.md)').trim(), '<p><a href="./a.md">x</a></p>')
})

test('a mailto link is left without a target', () => {
  assert.equal(
    renderMarkdown('[x](mailto:a@b.c)').trim(),
    '<p><a href="mailto:a@b.c">x</a></p>'
  )
})

test('linkify turns a bare URL into an external link', () => {
  const html = renderMarkdown('see https://example.com')
  assert.ok(html.includes('<a href="https://example.com" target="_blank"'))
})

// --- options and exports ---------------------------------------------------

test('typographer rewrites quotes, dashes and ellipses', () => {
  assert.equal(renderMarkdown('"quoted" -- dash ...').trim(), '<p>“quoted” – dash …</p>')
})

test('breaks is off, so a single newline is not a line break element', () => {
  const html = renderMarkdown('a\nb')
  assert.ok(!html.includes('<br'))
  assert.equal(html.trim(), '<p>a\nb</p>')
})

test('renderMarkdown treats a missing source as an empty document', () => {
  assert.equal(renderMarkdown(undefined), '')
  assert.equal(renderMarkdown(null), '')
  assert.equal(renderMarkdown(''), '')
})

test('renderInline applies inline rules without a paragraph wrapper', () => {
  assert.equal(renderInline('==hi=='), '<mark>hi</mark>')
})

test('renderInline does not run block rules', () => {
  assert.equal(renderInline('# not a heading'), '# not a heading')
})

test('renderInline treats a missing source as an empty string', () => {
  assert.equal(renderInline(undefined), '')
})
