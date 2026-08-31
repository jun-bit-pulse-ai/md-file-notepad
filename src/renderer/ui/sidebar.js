import { activeHeadingIndex, extractOutline } from '../lib/outline.js'

/**
 * The left sidebar, which shows either the document outline or the folder
 * containing the current file. Both panels are rebuilt from scratch on
 * update; documents are small enough that diffing would be wasted effort.
 */
class Sidebar {
  constructor(root, { onJumpToLine, onOpenFile }) {
    this.root = root
    this.onJumpToLine = onJumpToLine
    this.onOpenFile = onOpenFile
    this.mode = 'closed'
    this.headings = []
    this.currentFile = null
    this.expanded = new Set()

    this.root.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-tabs" role="tablist">
          <button class="sidebar-tab" data-mode="outline" role="tab">Outline</button>
          <button class="sidebar-tab" data-mode="files" role="tab">Files</button>
        </div>
      </div>
      <div class="sidebar-body">
        <nav class="outline-panel" hidden></nav>
        <nav class="files-panel" hidden></nav>
      </div>
    `

    this.outlinePanel = this.root.querySelector('.outline-panel')
    this.filesPanel = this.root.querySelector('.files-panel')

    this.root.querySelectorAll('.sidebar-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.setMode(tab.dataset.mode))
    })
  }

  setMode(mode) {
    this.mode = mode
    const open = mode !== 'closed'
    this.root.classList.toggle('is-open', open)
    this.outlinePanel.hidden = mode !== 'outline'
    this.filesPanel.hidden = mode !== 'files'
    this.root.querySelectorAll('.sidebar-tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.mode === mode)
      tab.setAttribute('aria-selected', String(tab.dataset.mode === mode))
    })
    if (mode === 'files' && this.currentDirectory) {
      this.loadDirectory(this.currentDirectory)
    }
    return mode
  }

  /** Toggling the same tab closes the sidebar, like a real inspector panel. */
  toggle(mode) {
    return this.setMode(this.mode === mode ? 'closed' : mode)
  }

  updateOutline(docText, cursorLine) {
    this.headings = extractOutline(docText)
    if (this.mode !== 'outline') return

    if (!this.headings.length) {
      this.outlinePanel.innerHTML =
        '<p class="sidebar-empty">No headings yet.<br>Start a line with <code>#</code>.</p>'
      return
    }

    const active = activeHeadingIndex(this.headings, cursorLine)
    const list = document.createElement('ul')
    list.className = 'outline-list'

    this.headings.forEach((heading, index) => {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.className = `outline-item outline-level-${heading.level}`
      button.textContent = heading.text
      button.title = heading.text
      if (index === active) button.classList.add('is-active')
      button.addEventListener('click', () => this.onJumpToLine(heading.line))
      item.appendChild(button)
      list.appendChild(item)
    })

    this.outlinePanel.replaceChildren(list)
  }

  async setCurrentFile(filePath, directory) {
    this.currentFile = filePath
    this.currentDirectory = directory
    if (this.mode === 'files' && directory) await this.loadDirectory(directory)
  }

  async loadDirectory(dirPath) {
    const result = await window.notepad.listDirectory(dirPath)
    if (result.error) {
      this.filesPanel.innerHTML = `<p class="sidebar-empty">${result.error}</p>`
      return
    }
    const header = document.createElement('div')
    header.className = 'files-root'
    header.textContent = dirPath.split('/').pop() || dirPath
    header.title = dirPath

    const list = this.renderEntries(result.entries)
    this.filesPanel.replaceChildren(header, list)
  }

  renderEntries(entries, depth = 0) {
    const list = document.createElement('ul')
    list.className = 'files-list'

    for (const entry of entries) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.className = `file-item file-${entry.type}`
      button.style.paddingLeft = `${12 + depth * 14}px`
      button.title = entry.path

      const icon = document.createElement('span')
      icon.className = 'file-icon'
      icon.textContent = entry.type === 'directory' ? '▸' : '•'

      const label = document.createElement('span')
      label.className = 'file-name'
      label.textContent = entry.name

      button.append(icon, label)

      if (entry.path === this.currentFile) button.classList.add('is-active')

      if (entry.type === 'directory') {
        button.addEventListener('click', async () => {
          const isOpen = this.expanded.has(entry.path)
          if (isOpen) {
            this.expanded.delete(entry.path)
            item.querySelector('.files-list')?.remove()
            icon.textContent = '▸'
          } else {
            this.expanded.add(entry.path)
            icon.textContent = '▾'
            const child = await window.notepad.listDirectory(entry.path)
            if (!child.error)
              item.appendChild(this.renderEntries(child.entries, depth + 1))
          }
        })
      } else {
        button.addEventListener('click', () => this.onOpenFile(entry.path))
      }

      item.appendChild(button)
      list.appendChild(item)
    }

    if (!entries.length) {
      const empty = document.createElement('p')
      empty.className = 'sidebar-empty'
      empty.textContent = 'No markdown files here.'
      list.appendChild(empty)
    }

    return list
  }
}

export { Sidebar }
