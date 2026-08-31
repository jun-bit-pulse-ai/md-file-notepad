/**
 * Preferences sheet.
 *
 * Every control is declared in one schema so the panel, its defaults and the
 * change plumbing stay in step — adding a setting means adding a row here,
 * not touching three files.
 */

const FIELDS = [
  {
    key: 'theme',
    label: 'Appearance',
    type: 'select',
    options: [
      ['system', 'Follow System'],
      ['light', 'Light'],
      ['dark', 'Dark'],
    ],
    hint: 'Dark mode follows macOS unless you pin one.',
  },
  {
    key: 'editorWidth',
    label: 'Text width',
    type: 'select',
    options: [
      ['narrow', 'Narrow'],
      ['normal', 'Normal'],
      ['wide', 'Wide'],
      ['full', 'Full window'],
    ],
  },
  {
    key: 'fontSize',
    label: 'Font size',
    type: 'range',
    min: 11,
    max: 28,
    step: 1,
    format: (value) => `${value}px`,
  },
  {
    key: 'spellcheck',
    label: 'Check spelling while typing',
    type: 'toggle',
    hint: 'Code blocks and inline code are never checked.',
  },
  {
    key: 'autosave',
    label: 'Autosave',
    type: 'toggle',
    hint: 'Saves a few seconds after you stop typing. Untitled documents still prompt.',
  },
  {
    key: 'focusMode',
    label: 'Focus mode',
    type: 'toggle',
    hint: 'Dims everything except the paragraph you are editing.',
  },
  {
    key: 'typewriterMode',
    label: 'Typewriter mode',
    type: 'toggle',
    hint: 'Keeps the caret vertically centred.',
  },
]

class Preferences {
  constructor(root, { onChange }) {
    this.root = root
    this.onChange = onChange
    this.controls = new Map()

    this.root.innerHTML = `
      <h2>Preferences</h2>
      <div class="prefs-grid"></div>
      <form method="dialog"><button class="sheet-close">Done</button></form>
    `

    const grid = this.root.querySelector('.prefs-grid')
    for (const field of FIELDS) {
      grid.appendChild(this.buildRow(field))
    }
  }

  buildRow(field) {
    const row = document.createElement('div')
    row.className = 'prefs-row'

    const label = document.createElement('label')
    label.className = 'prefs-label'
    label.textContent = field.label

    const control = document.createElement('div')
    control.className = 'prefs-control'

    let input
    if (field.type === 'select') {
      input = document.createElement('select')
      for (const [value, text] of field.options) {
        const option = document.createElement('option')
        option.value = value
        option.textContent = text
        input.appendChild(option)
      }
      input.addEventListener('change', () => this.emit(field.key, input.value))
    } else if (field.type === 'toggle') {
      input = document.createElement('input')
      input.type = 'checkbox'
      input.className = 'prefs-toggle'
      input.addEventListener('change', () => this.emit(field.key, input.checked))
    } else if (field.type === 'range') {
      input = document.createElement('input')
      input.type = 'range'
      input.min = field.min
      input.max = field.max
      input.step = field.step
      const readout = document.createElement('span')
      readout.className = 'prefs-readout'
      input.addEventListener('input', () => {
        const value = Number(input.value)
        readout.textContent = field.format ? field.format(value) : String(value)
        this.emit(field.key, value)
      })
      control.appendChild(input)
      control.appendChild(readout)
      this.controls.set(field.key, { input, readout, field })
    }

    if (field.type !== 'range') {
      control.appendChild(input)
      this.controls.set(field.key, { input, field })
    }

    label.setAttribute('for', `pref-${field.key}`)
    input.id = `pref-${field.key}`

    row.appendChild(label)
    row.appendChild(control)

    if (field.hint) {
      const hint = document.createElement('p')
      hint.className = 'prefs-hint'
      hint.textContent = field.hint
      row.appendChild(hint)
    }

    return row
  }

  emit(key, value) {
    this.onChange(key, value)
  }

  /** Pushes current preference values into the controls. */
  sync(prefs) {
    for (const [key, { input, readout, field }] of this.controls) {
      const value = prefs[key]
      if (field.type === 'toggle') {
        input.checked = value !== false
        // `spellcheck` defaults on; the rest default off.
        if (key !== 'spellcheck') input.checked = Boolean(value)
      } else if (field.type === 'range') {
        const numeric = Number(value) || 16
        input.value = String(numeric)
        if (readout)
          readout.textContent = field.format ? field.format(numeric) : String(numeric)
      } else {
        input.value = value ?? field.options[0][0]
      }
    }
  }

  open(prefs) {
    this.sync(prefs)
    this.root.showModal()
  }
}

export { FIELDS, Preferences }
