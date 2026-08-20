import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { slugify } from './outline.js'

/**
 * One markdown renderer, used for three things: the rendered widgets inside
 * the live-preview editor, HTML export, and PDF export. Sharing it is what
 * keeps "what you see" and "what you export" identical.
 *
 * `html` is off on purpose. Opening someone else's .md file should never be
 * able to run script in the app, and inline HTML is rare enough in practice
 * that escaping it is the right trade for a local editor.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: true,
})

/** ==highlight== -> <mark>highlight</mark> */
function highlightPlugin(instance) {
  instance.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x3d /* = */) return false
    if (state.src.charCodeAt(start + 1) !== 0x3d) return false
    const end = state.src.indexOf('==', start + 2)
    if (end === -1) return false
    const content = state.src.slice(start + 2, end)
    if (!content.trim()) return false
    if (!silent) {
      state.push('mark_open', 'mark', 1)
      const text = state.push('text', '', 0)
      text.content = content
      state.push('mark_close', 'mark', -1)
    }
    state.pos = end + 2
    return true
  })
}

/** $inline$ and $$block$$ math, rendered with KaTeX at parse time. */
function mathPlugin(instance) {
  instance.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false
    if (state.src.charCodeAt(start + 1) === 0x24) return false
    // A lone "$12.00" shouldn't start math.
    let end = start + 1
    while (end < state.src.length) {
      if (state.src.charCodeAt(end) === 0x24 && state.src.charCodeAt(end - 1) !== 0x5c) break
      if (state.src.charCodeAt(end) === 0x0a) return false
      end++
    }
    if (end >= state.src.length) return false
    const content = state.src.slice(start + 1, end)
    if (!content.trim()) return false
    if (!silent) {
      const token = state.push('math_inline', 'span', 0)
      token.content = content
    }
    state.pos = end + 1
    return true
  })

  instance.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]
    if (start + 2 > max) return false
    if (state.src.slice(start, start + 2) !== '$$') return false
    if (silent) return true

    let nextLine = startLine
    let found = false
    const firstLine = state.src.slice(start + 2, max).trim()
    if (firstLine.endsWith('$$') && firstLine.length > 2) {
      found = true
    }
    const buffer = found ? [firstLine.slice(0, -2)] : firstLine ? [firstLine] : []

    while (!found && ++nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
      const lineMax = state.eMarks[nextLine]
      const line = state.src.slice(lineStart, lineMax)
      if (line.trim() === '$$') {
        found = true
        break
      }
      buffer.push(line)
    }
    if (!found) return false

    const token = state.push('math_block', 'div', 0)
    token.block = true
    token.content = buffer.join('\n')
    state.line = nextLine + 1
    return true
  })

  const render = (content, displayMode) => {
    try {
      return katex.renderToString(content.trim(), {
        displayMode,
        throwOnError: false,
        output: 'html',
      })
    } catch (err) {
      return `<code class="math-error">${instance.utils.escapeHtml(content)}</code>`
    }
  }

  instance.renderer.rules.math_inline = (tokens, idx) =>
    `<span class="math math-inline">${render(tokens[idx].content, false)}</span>`
  instance.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math math-block">${render(tokens[idx].content, true)}</div>`
}

/** Renders `- [ ]` / `- [x]` as real (disabled) checkboxes. */
function taskListPlugin(instance) {
  const defaultRender =
    instance.renderer.rules.text ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

  instance.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline') continue
      const parent = tokens[i - 2]
      if (!parent || parent.type !== 'list_item_open') continue
      const match = /^\[([ xX])\]\s+/.exec(tokens[i].content)
      if (!match) continue

      const checked = match[1].toLowerCase() === 'x'
      tokens[i].content = tokens[i].content.slice(match[0].length)
      const children = tokens[i].children
      if (children && children.length && children[0].type === 'text') {
        children[0].content = children[0].content.replace(/^\[([ xX])\]\s+/, '')
      }
      const checkbox = new state.Token('html_inline', '', 0)
      checkbox.content = `<input class="task-checkbox" type="checkbox" disabled${
        checked ? ' checked' : ''
      }> `
      children.unshift(checkbox)
      parent.attrJoin('class', checked ? 'task-item task-done' : 'task-item')
    }
    return true
  })

  instance.renderer.rules.text = defaultRender
}

/** Adds slug ids to headings so exported HTML supports #anchor links. */
function headingAnchorPlugin(instance) {
  const defaultOpen =
    instance.renderer.rules.heading_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

  instance.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const inline = tokens[idx + 1]
    if (inline && inline.type === 'inline') {
      const slug = slugify(inline.content)
      if (slug) tokens[idx].attrSet('id', slug)
    }
    return defaultOpen(tokens, idx, options, env, self)
  }
}

md.use(highlightPlugin)
md.use(mathPlugin)
md.use(taskListPlugin)
md.use(headingAnchorPlugin)

// External links open in the browser; the main process denies in-app nav.
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || ''
  if (/^https?:/i.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

function renderMarkdown(source) {
  return md.render(source || '')
}

function renderInline(source) {
  return md.renderInline(source || '')
}

export { md, renderInline, renderMarkdown }
