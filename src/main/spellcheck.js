/**
 * Spell checking.
 *
 * Chromium does the actual checking on the editable surface; this module
 * owns the configuration and the right-click menu that surfaces
 * suggestions, since a spell checker with no way to accept a correction
 * isn't much use.
 *
 * Platform note: on macOS the OS speller (NSSpellChecker) is used. It picks
 * the language automatically and ignores any list we set, so language
 * selection is only meaningful on Windows and Linux.
 */

const MAX_SUGGESTIONS = 6

const usesOsSpellChecker = (platform = process.platform) => platform === 'darwin'

/**
 * Filters a requested language list down to what the session actually
 * supports, preserving the caller's order and dropping duplicates.
 * Returns null when there is nothing valid to apply.
 */
function normalizeLanguages(requested, available) {
  if (!Array.isArray(requested) || !requested.length) return null
  if (!Array.isArray(available) || !available.length) return null

  const supported = new Set(available)
  const seen = new Set()
  const result = []

  for (const raw of requested) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const code = raw.trim()
    // Accept "en" for "en-US" so a coarse preference still resolves.
    const match = supported.has(code)
      ? code
      : available.find((lang) => lang.toLowerCase().startsWith(`${code.toLowerCase()}-`))
    if (!match || seen.has(match)) continue
    seen.add(match)
    result.push(match)
  }

  return result.length ? result : null
}

/**
 * Applies spell-checker preferences to a session, tolerating the platform
 * differences above. Returns what was actually applied.
 */
function applySpellCheckerSettings(session, { enabled = true, languages } = {}, platform = process.platform) {
  const applied = { enabled: Boolean(enabled), languages: null }

  try {
    session.setSpellCheckerEnabled(Boolean(enabled))
  } catch (err) {
    console.error('[spellcheck] could not toggle spell checker:', err.message)
  }

  if (!enabled || usesOsSpellChecker(platform)) return applied

  try {
    const available = session.availableSpellCheckerLanguages || []
    const next = normalizeLanguages(languages, available)
    if (next) {
      session.setSpellCheckerLanguages(next)
      applied.languages = next
    }
  } catch (err) {
    console.error('[spellcheck] could not set languages:', err.message)
  }

  return applied
}

/**
 * Builds the right-click menu as a plain template array.
 *
 * Kept free of Electron imports so the menu's shape can be tested directly:
 * `params` is the context-menu payload, `handlers` the callbacks to attach.
 */
function buildContextMenuTemplate(params = {}, handlers = {}) {
  const {
    misspelledWord = '',
    dictionarySuggestions = [],
    isEditable = false,
    selectionText = '',
    editFlags = {},
  } = params

  const {
    onReplaceMisspelling = () => {},
    onAddToDictionary = () => {},
    onCommand = () => {},
  } = handlers

  const template = []

  if (isEditable && misspelledWord) {
    if (dictionarySuggestions.length) {
      for (const suggestion of dictionarySuggestions.slice(0, MAX_SUGGESTIONS)) {
        template.push({
          label: suggestion,
          click: () => onReplaceMisspelling(suggestion),
        })
      }
    } else {
      template.push({ label: 'No Guesses Found', enabled: false })
    }

    template.push({ type: 'separator' })
    template.push({
      label: 'Add to Dictionary',
      click: () => onAddToDictionary(misspelledWord),
    })
    template.push({ type: 'separator' })
  }

  const hasSelection = Boolean(selectionText)

  template.push({ role: 'cut', enabled: Boolean(editFlags.canCut) })
  template.push({ role: 'copy', enabled: Boolean(editFlags.canCopy) })
  template.push({ role: 'paste', enabled: Boolean(editFlags.canPaste) })

  if (isEditable) {
    template.push({ type: 'separator' })
    template.push({ label: 'Bold', click: () => onCommand('format:bold'), enabled: hasSelection })
    template.push({ label: 'Italic', click: () => onCommand('format:italic'), enabled: hasSelection })
    template.push({ label: 'Inline Code', click: () => onCommand('format:code'), enabled: hasSelection })
    template.push({ label: 'Link…', click: () => onCommand('format:link') })
  }

  template.push({ type: 'separator' })
  template.push({ role: 'selectAll' })

  return template
}

module.exports = {
  MAX_SUGGESTIONS,
  applySpellCheckerSettings,
  buildContextMenuTemplate,
  normalizeLanguages,
  usesOsSpellChecker,
}
