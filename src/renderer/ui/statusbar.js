import { computeStats, formatStats } from '../lib/stats.js'

/**
 * Bottom status bar: document stats on the left, view-mode toggles on the
 * right. Stats are recomputed on a trailing debounce so typing in a long
 * document doesn't pay for a full re-scan on every keystroke.
 */
class StatusBar {
  constructor(root, { onToggleMode }) {
    this.root = root
    this.onToggleMode = onToggleMode
    this.debounceTimer = null

    this.root.innerHTML = `
      <div class="status-left">
        <span class="status-stats">0 words</span>
      </div>
      <div class="status-right">
        <span class="status-position"></span>
        <button class="status-toggle" data-mode="focusMode" title="Focus Mode (⌘⇧F)">Focus</button>
        <button class="status-toggle" data-mode="typewriterMode" title="Typewriter Mode (⌘⇧T)">Typewriter</button>
        <button class="status-toggle" data-mode="sourceMode" title="Source Mode (⌘/)">Source</button>
      </div>
    `

    this.statsEl = this.root.querySelector('.status-stats')
    this.positionEl = this.root.querySelector('.status-position')

    this.root.querySelectorAll('.status-toggle').forEach((button) => {
      button.addEventListener('click', () => this.onToggleMode(button.dataset.mode))
    })
  }

  /** `state` is the CodeMirror EditorState. */
  update(state) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      const doc = state.doc.toString()
      const range = state.selection.main
      const selection = range.empty ? '' : state.doc.sliceString(range.from, range.to)
      const stats = computeStats(doc, selection)
      this.statsEl.textContent = formatStats(stats)

      const line = state.doc.lineAt(range.head)
      this.positionEl.textContent = `Ln ${line.number}, Col ${range.head - line.from + 1}`
    }, 120)
  }

  setModes(modes) {
    this.root.querySelectorAll('.status-toggle').forEach((button) => {
      button.classList.toggle('is-active', Boolean(modes[button.dataset.mode]))
    })
  }

  flash(message, tone = 'info') {
    const el = document.createElement('span')
    el.className = `status-flash status-flash-${tone}`
    el.textContent = message
    this.root.querySelector('.status-left').appendChild(el)
    requestAnimationFrame(() => el.classList.add('is-visible'))
    setTimeout(() => {
      el.classList.remove('is-visible')
      setTimeout(() => el.remove(), 300)
    }, 2200)
  }
}

export { StatusBar }
