import { highlightSegments, rankItems } from '../lib/fuzzy.js'

/** Rendering every match in a large folder is wasted work; cap the list. */
const MAX_VISIBLE = 60

/**
 * Quick Open (⌘P): a fuzzy file switcher over the folder containing the
 * current document. Keyboard-first — the mouse is optional throughout.
 */
class Palette {
  constructor(root, { onOpenFile }) {
    this.root = root
    this.onOpenFile = onOpenFile
    this.files = []
    this.results = []
    this.activeIndex = 0
    this.isOpen = false

    this.root.innerHTML = `
      <div class="palette-backdrop"></div>
      <div class="palette-panel" role="dialog" aria-label="Quick Open">
        <input class="palette-input" type="text" placeholder="Search files…"
               spellcheck="false" autocomplete="off" aria-label="Search files">
        <ul class="palette-results" role="listbox"></ul>
        <div class="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span class="palette-count"></span>
        </div>
      </div>
    `

    this.input = this.root.querySelector('.palette-input')
    this.list = this.root.querySelector('.palette-results')
    this.count = this.root.querySelector('.palette-count')

    this.input.addEventListener('input', () => {
      this.activeIndex = 0
      this.render()
    })
    this.input.addEventListener('keydown', (event) => this.handleKey(event))
    this.root.querySelector('.palette-backdrop').addEventListener('click', () => this.close())

    this.close()
  }

  open(files, { truncated = false } = {}) {
    this.files = files || []
    this.truncated = truncated
    this.isOpen = true
    this.activeIndex = 0
    this.root.hidden = false
    this.root.classList.add('is-open')
    this.input.value = ''
    this.render()
    this.input.focus()
  }

  close() {
    this.isOpen = false
    this.root.hidden = true
    this.root.classList.remove('is-open')
  }

  handleKey(event) {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        this.close()
        break
      case 'ArrowDown':
        event.preventDefault()
        this.move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        this.move(-1)
        break
      case 'Home':
        event.preventDefault()
        this.setActive(0)
        break
      case 'End':
        event.preventDefault()
        this.setActive(this.results.length - 1)
        break
      case 'Enter':
        event.preventDefault()
        this.confirm()
        break
      default:
        break
    }
  }

  move(delta) {
    if (!this.results.length) return
    // Wrap around: pressing up from the top lands on the last result.
    const next = (this.activeIndex + delta + this.results.length) % this.results.length
    this.setActive(next)
  }

  setActive(index) {
    if (!this.results.length) return
    this.activeIndex = Math.max(0, Math.min(index, this.results.length - 1))
    this.renderActive()
  }

  confirm() {
    const result = this.results[this.activeIndex]
    if (!result) return
    this.close()
    this.onOpenFile(result.item.path)
  }

  render() {
    const query = this.input.value.trim()
    this.results = rankItems(query, this.files, (file) => file.relativePath).slice(0, MAX_VISIBLE)

    if (!this.files.length) {
      this.list.innerHTML = '<li class="palette-empty">No Markdown files in this folder.</li>'
      this.count.textContent = ''
      return
    }

    if (!this.results.length) {
      this.list.innerHTML = '<li class="palette-empty">No matches.</li>'
      this.count.textContent = ''
      return
    }

    const items = this.results.map((result, index) => {
      const item = document.createElement('li')
      item.className = 'palette-item'
      item.setAttribute('role', 'option')
      if (index === this.activeIndex) item.classList.add('is-active')

      const name = document.createElement('span')
      name.className = 'palette-name'
      for (const segment of highlightSegments(result.item.relativePath, result.positions)) {
        const span = document.createElement('span')
        span.textContent = segment.text
        if (segment.matched) span.className = 'palette-match'
        name.appendChild(span)
      }

      item.appendChild(name)
      item.addEventListener('click', () => {
        this.activeIndex = index
        this.confirm()
      })
      item.addEventListener('mousemove', () => this.setActive(index))
      return item
    })

    this.list.replaceChildren(...items)

    const shown = this.results.length
    const total = this.files.length
    this.count.textContent =
      shown < total ? `${shown} of ${total}${this.truncated ? '+' : ''}` : `${total} files`
  }

  renderActive() {
    const items = this.list.querySelectorAll('.palette-item')
    items.forEach((item, index) => {
      item.classList.toggle('is-active', index === this.activeIndex)
    })
    items[this.activeIndex]?.scrollIntoView({ block: 'nearest' })
  }
}

export { MAX_VISIBLE, Palette }
