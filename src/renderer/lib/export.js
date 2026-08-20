import { renderMarkdown } from './markdown.js'

/**
 * Styles for exported HTML/PDF. Inlined rather than linked so a single
 * exported .html file stays readable when emailed or opened offline.
 */
const EXPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  padding: 48px 24px 96px;
  max-width: 46em;
  font: 16px/1.7 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
  color: #1d1d1f;
  background: #ffffff;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.8em 0 0.6em; font-weight: 650; }
h1 { font-size: 2em; margin-top: 0; }
h2 { font-size: 1.5em; border-bottom: 1px solid #e8e8ed; padding-bottom: .3em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.05em; }
h5, h6 { font-size: 1em; color: #6e6e73; }
p, ul, ol, blockquote, table, pre { margin: 0 0 1.15em; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  font-size: .88em;
  background: #f5f5f7;
  padding: .15em .4em;
  border-radius: 4px;
}
pre {
  background: #f5f5f7;
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  line-height: 1.5;
}
pre code { background: none; padding: 0; font-size: .85em; }
blockquote {
  margin-left: 0;
  padding: .2em 0 .2em 1.1em;
  border-left: 3px solid #d2d2d7;
  color: #515154;
}
table { border-collapse: collapse; width: 100%; font-size: .95em; }
th, td { border: 1px solid #e0e0e5; padding: 8px 12px; text-align: left; }
th { background: #f5f5f7; font-weight: 600; }
tr:nth-child(even) td { background: #fafafc; }
img { max-width: 100%; height: auto; border-radius: 6px; }
hr { border: none; border-top: 1px solid #e0e0e5; margin: 2em 0; }
mark { background: #fff3a3; padding: .1em .2em; border-radius: 3px; }
ul, ol { padding-left: 1.5em; }
li { margin: .25em 0; }
li.task-item { list-style: none; margin-left: -1.3em; }
.task-checkbox { margin-right: .5em; vertical-align: middle; }
li.task-done { color: #86868b; text-decoration: line-through; }
.footnotes { font-size: .9em; color: #6e6e73; border-top: 1px solid #e8e8ed; margin-top: 3em; }
.math-block { overflow-x: auto; text-align: center; margin: 1.4em 0; }
@media print {
  body { padding: 0; max-width: none; font-size: 11pt; }
  pre, blockquote, table, img { break-inside: avoid; }
  h1, h2, h3, h4 { break-after: avoid; }
  a { color: inherit; }
}
`

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Wraps rendered markdown in a standalone document.
 * `katexCss` is passed in by the caller (the bundler owns that stylesheet)
 * so math survives the trip into an exported file.
 */
function buildHtmlDocument(markdown, { title = 'Untitled', katexCss = '' } = {}) {
  const body = renderMarkdown(markdown)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
${katexCss ? `<style>${katexCss}</style>` : ''}
</head>
<body>
${body}
</body>
</html>`
}

export { buildHtmlDocument, escapeHtml, EXPORT_CSS }
