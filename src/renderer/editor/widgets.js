import { WidgetType } from '@codemirror/view'
import katex from 'katex'
import { renderMarkdown } from '../lib/markdown.js'

/**
 * Document context shared with widgets that need to resolve relative paths
 * (images, mostly). Set by the app whenever a file is loaded.
 */
const docContext = { directory: null }

function setDocumentDirectory(dir) {
  docContext.directory = dir || null
}

/** Turns a markdown image target into something the renderer can load. */
function resolveAssetPath(src) {
  if (!src) return ''
  if (/^(https?:|data:|file:)/i.test(src)) return src
  const decoded = src.replace(/^<|>$/g, '')
  if (decoded.startsWith('/')) return `file://${decoded}`
  if (!docContext.directory) return decoded
  const base = docContext.directory.replace(/\/$/, '')
  return `file://${base}/${decoded.replace(/^\.\//, '')}`
}

/**
 * Replaces a `- [ ]` marker with a real checkbox. Clicking it rewrites the
 * source, which is what makes task lists feel native rather than decorative.
 */
class TaskWidget extends WidgetType {
  constructor(checked, from, to) {
    super()
    this.checked = checked
    this.from = from
    this.to = to
  }

  eq(other) {
    return other.checked === this.checked && other.from === this.from
  }

  toDOM(view) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-task-checkbox'
    box.checked = this.checked
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? '[ ]' : '[x]',
        },
      })
    })
    return box
  }

  ignoreEvent() {
    return false
  }
}

/** A styled bullet standing in for `-`, `*` or `+`. */
class BulletWidget extends WidgetType {
  constructor(depth) {
    super()
    this.depth = depth
  }

  eq(other) {
    return other.depth === this.depth
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = ['•', '◦', '▪'][this.depth % 3]
    return span
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-hr-wrap'
    wrap.appendChild(document.createElement('hr'))
    return wrap
  }
}

class ImageWidget extends WidgetType {
  constructor(src, alt, title) {
    super()
    this.src = src
    this.alt = alt || ''
    this.title = title || ''
  }

  eq(other) {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM() {
    const figure = document.createElement('span')
    figure.className = 'cm-image'
    const img = document.createElement('img')
    img.src = resolveAssetPath(this.src)
    img.alt = this.alt
    if (this.title) img.title = this.title
    img.loading = 'lazy'
    img.addEventListener('error', () => {
      figure.classList.add('cm-image-broken')
      figure.setAttribute('data-label', this.alt || this.src || 'image')
    })
    figure.appendChild(img)
    if (this.alt) {
      const caption = document.createElement('span')
      caption.className = 'cm-image-caption'
      caption.textContent = this.alt
      figure.appendChild(caption)
    }
    return figure
  }
}

class MathWidget extends WidgetType {
  constructor(source, block) {
    super()
    this.source = source
    this.block = block
  }

  eq(other) {
    return other.source === this.source && other.block === this.block
  }

  toDOM() {
    const el = document.createElement(this.block ? 'div' : 'span')
    el.className = this.block ? 'cm-math cm-math-block' : 'cm-math cm-math-inline'
    try {
      katex.render(this.source, el, {
        displayMode: this.block,
        throwOnError: false,
        output: 'html',
      })
    } catch {
      el.classList.add('cm-math-error')
      el.textContent = this.source
    }
    return el
  }
}

/**
 * Renders a whole GFM table as HTML. Shown when the cursor is outside the
 * table; moving into it swaps back to the pipe source for editing.
 */
class TableWidget extends WidgetType {
  constructor(source) {
    super()
    this.source = source
  }

  eq(other) {
    return other.source === this.source
  }

  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-table-wrap'
    wrap.innerHTML = renderMarkdown(this.source)
    return wrap
  }

  ignoreEvent() {
    return false
  }
}

/** The language chip shown in place of an opening code fence. */
class CodeInfoWidget extends WidgetType {
  constructor(language) {
    super()
    this.language = language
  }

  eq(other) {
    return other.language === this.language
  }

  toDOM() {
    const chip = document.createElement('span')
    chip.className = 'cm-code-lang'
    chip.textContent = this.language || 'text'
    return chip
  }
}

/** Renders the `[text](url)` target as a subtle trailing chip. */
class LinkTargetWidget extends WidgetType {
  constructor(url) {
    super()
    this.url = url
  }

  eq(other) {
    return other.url === this.url
  }

  toDOM() {
    const chip = document.createElement('span')
    chip.className = 'cm-link-chip'
    chip.textContent = shortenUrl(this.url)
    chip.title = this.url
    return chip
  }
}

function shortenUrl(url) {
  if (!url) return ''
  const cleaned = url.replace(/^https?:\/\//, '').replace(/^www\./, '')
  return cleaned.length > 32 ? `${cleaned.slice(0, 30)}…` : cleaned
}

export {
  BulletWidget,
  CodeInfoWidget,
  HorizontalRuleWidget,
  ImageWidget,
  LinkTargetWidget,
  MathWidget,
  TableWidget,
  TaskWidget,
  docContext,
  resolveAssetPath,
  setDocumentDirectory,
  shortenUrl,
}
