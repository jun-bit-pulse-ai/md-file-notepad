const test = require('node:test')
const assert = require('node:assert/strict')

const {
  applySpellCheckerSettings,
  buildContextMenuTemplate,
  normalizeLanguages,
  usesOsSpellChecker,
} = require('../src/main/spellcheck.js')

const labels = (template) => template.map((item) => item.label || item.role || item.type)

/* ------------------------------- languages ------------------------------ */

test('normalizeLanguages keeps only supported codes, in the requested order', () => {
  assert.deepEqual(normalizeLanguages(['fr-FR', 'en-US'], ['en-US', 'fr-FR', 'de-DE']), [
    'fr-FR',
    'en-US',
  ])
})

test('normalizeLanguages resolves a bare language to a regional variant', () => {
  assert.deepEqual(normalizeLanguages(['en'], ['en-GB', 'fr-FR']), ['en-GB'])
})

test('normalizeLanguages drops unsupported codes and duplicates', () => {
  assert.deepEqual(normalizeLanguages(['en-US', 'kl-KL', 'en-US'], ['en-US', 'fr-FR']), [
    'en-US',
  ])
})

test('normalizeLanguages returns null when nothing usable remains', () => {
  assert.equal(normalizeLanguages(['zz'], ['en-US']), null)
  assert.equal(normalizeLanguages([], ['en-US']), null)
  assert.equal(normalizeLanguages(null, ['en-US']), null)
  assert.equal(normalizeLanguages(['en'], []), null)
})

test('normalizeLanguages ignores blank and non-string entries', () => {
  assert.deepEqual(normalizeLanguages(['', '  ', 7, 'en-US'], ['en-US']), ['en-US'])
})

/* ------------------------------- settings ------------------------------- */

function fakeSession(available = ['en-US', 'fr-FR']) {
  return {
    availableSpellCheckerLanguages: available,
    enabled: null,
    languages: null,
    setSpellCheckerEnabled(value) {
      this.enabled = value
    },
    setSpellCheckerLanguages(value) {
      this.languages = value
    },
  }
}

test('enabling applies both the toggle and the languages', () => {
  const session = fakeSession()
  const applied = applySpellCheckerSettings(
    session,
    { enabled: true, languages: ['fr-FR'] },
    'linux'
  )

  assert.equal(session.enabled, true)
  assert.deepEqual(session.languages, ['fr-FR'])
  assert.deepEqual(applied, { enabled: true, languages: ['fr-FR'] })
})

test('disabling skips language configuration entirely', () => {
  const session = fakeSession()
  applySpellCheckerSettings(session, { enabled: false, languages: ['fr-FR'] }, 'linux')

  assert.equal(session.enabled, false)
  assert.equal(session.languages, null)
})

test('macOS leaves languages to the OS speller', () => {
  const session = fakeSession()
  const applied = applySpellCheckerSettings(
    session,
    { enabled: true, languages: ['fr-FR'] },
    'darwin'
  )

  assert.equal(session.enabled, true, 'the toggle still applies')
  assert.equal(session.languages, null, 'but languages are not forced')
  assert.equal(applied.languages, null)
})

test('usesOsSpellChecker is true only on macOS', () => {
  assert.equal(usesOsSpellChecker('darwin'), true)
  assert.equal(usesOsSpellChecker('linux'), false)
  assert.equal(usesOsSpellChecker('win32'), false)
})

test('a session that throws does not take the app down', () => {
  const session = {
    availableSpellCheckerLanguages: ['en-US'],
    setSpellCheckerEnabled() {
      throw new Error('nope')
    },
    setSpellCheckerLanguages() {
      throw new Error('nope')
    },
  }
  assert.doesNotThrow(() =>
    applySpellCheckerSettings(session, { enabled: true, languages: ['en-US'] }, 'linux')
  )
})

/* ----------------------------- context menu ----------------------------- */

const EDIT_FLAGS = { canCut: true, canCopy: true, canPaste: true }

test('a misspelled word lists its suggestions first', () => {
  const template = buildContextMenuTemplate(
    {
      isEditable: true,
      misspelledWord: 'teh',
      dictionarySuggestions: ['the', 'tea'],
      editFlags: EDIT_FLAGS,
    },
    {}
  )
  assert.deepEqual(labels(template).slice(0, 4), [
    'the',
    'tea',
    'separator',
    'Add to Dictionary',
  ])
})

test('clicking a suggestion replaces the misspelling', () => {
  const replaced = []
  const template = buildContextMenuTemplate(
    {
      isEditable: true,
      misspelledWord: 'teh',
      dictionarySuggestions: ['the'],
      editFlags: EDIT_FLAGS,
    },
    { onReplaceMisspelling: (word) => replaced.push(word) }
  )
  template[0].click()
  assert.deepEqual(replaced, ['the'])
})

test('Add to Dictionary passes the misspelled word through', () => {
  const added = []
  const template = buildContextMenuTemplate(
    {
      isEditable: true,
      misspelledWord: 'notepad',
      dictionarySuggestions: [],
      editFlags: EDIT_FLAGS,
    },
    { onAddToDictionary: (word) => added.push(word) }
  )
  template.find((item) => item.label === 'Add to Dictionary').click()
  assert.deepEqual(added, ['notepad'])
})

test('a word with no suggestions still offers the dictionary', () => {
  const template = buildContextMenuTemplate(
    {
      isEditable: true,
      misspelledWord: 'xyzzy',
      dictionarySuggestions: [],
      editFlags: EDIT_FLAGS,
    },
    {}
  )
  const names = labels(template)
  assert.ok(names.includes('No Guesses Found'))
  assert.ok(names.includes('Add to Dictionary'))
})

test('suggestions are capped so the menu stays usable', () => {
  const many = Array.from({ length: 20 }, (_, i) => `word${i}`)
  const template = buildContextMenuTemplate(
    {
      isEditable: true,
      misspelledWord: 'wrd',
      dictionarySuggestions: many,
      editFlags: EDIT_FLAGS,
    },
    {}
  )
  const suggestions = labels(template).filter((label) => /^word\d+$/.test(label))
  assert.equal(suggestions.length, 6)
})

test('correctly spelled text gets no spelling section', () => {
  const template = buildContextMenuTemplate(
    {
      isEditable: true,
      misspelledWord: '',
      selectionText: 'fine',
      editFlags: EDIT_FLAGS,
    },
    {}
  )
  const names = labels(template)
  assert.ok(!names.includes('Add to Dictionary'))
  assert.deepEqual(names.slice(0, 3), ['cut', 'copy', 'paste'])
})

test('read-only content offers no editing commands', () => {
  const template = buildContextMenuTemplate(
    {
      isEditable: false,
      misspelledWord: 'teh',
      dictionarySuggestions: ['the'],
      editFlags: {},
    },
    {}
  )
  const names = labels(template)
  assert.ok(!names.includes('Add to Dictionary'), 'no dictionary entry outside an editor')
  assert.ok(!names.includes('Bold'), 'no formatting entries outside an editor')
})

test('clipboard items follow the reported edit flags', () => {
  const template = buildContextMenuTemplate(
    { isEditable: true, editFlags: { canCut: false, canCopy: false, canPaste: true } },
    {}
  )
  const byRole = Object.fromEntries(
    template.filter((item) => item.role).map((item) => [item.role, item.enabled])
  )
  assert.equal(byRole.cut, false)
  assert.equal(byRole.copy, false)
  assert.equal(byRole.paste, true)
})

test('formatting entries need a selection, except Link', () => {
  const template = buildContextMenuTemplate(
    { isEditable: true, selectionText: '', editFlags: {} },
    {}
  )
  const byLabel = Object.fromEntries(
    template.filter((i) => i.label).map((i) => [i.label, i.enabled])
  )
  assert.equal(byLabel.Bold, false)
  assert.equal(byLabel['Link…'], undefined, 'Link stays available with no selection')
})

test('formatting entries dispatch editor commands', () => {
  const sent = []
  const template = buildContextMenuTemplate(
    { isEditable: true, selectionText: 'word', editFlags: EDIT_FLAGS },
    { onCommand: (command) => sent.push(command) }
  )
  template.find((item) => item.label === 'Bold').click()
  template.find((item) => item.label === 'Link…').click()
  assert.deepEqual(sent, ['format:bold', 'format:link'])
})
