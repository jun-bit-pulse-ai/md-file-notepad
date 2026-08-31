/**
 * Headless smoke test.
 *
 * Boots the real application (same main process, preload and renderer that
 * ship), waits for the first window to paint, then reports any renderer
 * console errors and writes a screenshot. Run it with:
 *
 *   xvfb-run -a npx electron scripts/smoke.js [--out shot.png] [--doc file.md]
 *
 * Exits non-zero if the renderer logged an error, so it can gate a build.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}

const outPath = path.resolve(flag('out', 'smoke.png'))
const settleMs = Number(flag('settle', 4000))
const errors = []

// Booting the real main process wires up every IPC handler and the menu.
require('../src/main/main.js')

/**
 * Optional end-to-end check of the Word export. Replaces the save-dialog
 * handler with one that writes straight to a path, so the renderer's real
 * export pipeline (bundled docx library included) runs unattended.
 */
const docxOut = flag('export-docx', '')
if (docxOut) {
  app.whenReady().then(() => {
    ipcMain.removeHandler('file:export-docx')
    ipcMain.handle('file:export-docx', async (_event, { data }) => {
      fs.writeFileSync(path.resolve(docxOut), Buffer.from(data))
      return { ok: true, filePath: path.resolve(docxOut) }
    })
  })
}

app.whenReady().then(() => {
  setTimeout(async () => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) {
      console.error('SMOKE FAIL: no window was created')
      app.exit(1)
      return
    }

    win.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) errors.push(message)
    })

    // Ask the renderer whether it actually mounted, rather than trusting
    // that a blank window means success.
    const report = await win.webContents.executeJavaScript(`
      (() => ({
        title: document.title,
        hasEditor: !!document.querySelector('.cm-content'),
        headings: document.querySelectorAll('.cm-md-heading').length,
        codeBlocks: document.querySelectorAll('.cm-md-codeblock').length,
        tables: document.querySelectorAll('.cm-table-wrap table').length,
        checkboxes: document.querySelectorAll('.cm-task-checkbox').length,
        math: document.querySelectorAll('.cm-math').length,
        codeSpellcheckOff: document.querySelectorAll('.cm-md-codeblock[spellcheck=\\"false\\"]').length,
        proseSpellcheckOn: document.querySelector('.cm-content')?.getAttribute('spellcheck') || null,
        bullets: document.querySelectorAll('.cm-bullet').length,
        links: document.querySelectorAll('.cm-md-link').length,
        hrs: document.querySelectorAll('.cm-hr-wrap').length,
        stats: document.querySelector('.status-stats')?.textContent || '',
        fatal: document.querySelector('.fatal')?.textContent || null,
        text: document.querySelector('.cm-content')?.innerText.slice(0, 120) || '',
      }))()
    `)

    // Optionally drive the new UI surfaces and report what opened.
    if (args.includes('--exercise-ui')) {
      win.webContents.send('menu:command', 'file:quick-open')
      await new Promise((resolve) => setTimeout(resolve, 1200))
      report.paletteOpen = await win.webContents.executeJavaScript(
        `!document.getElementById('palette').hidden`
      )
      report.paletteResults = await win.webContents.executeJavaScript(
        `document.querySelectorAll('.palette-item').length`
      )
      // Type a query and confirm it filters.
      await win.webContents.executeJavaScript(`
        (() => {
          const input = document.querySelector('.palette-input')
          input.value = 'demo'
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `)
      await new Promise((resolve) => setTimeout(resolve, 400))
      report.paletteFiltered = await win.webContents.executeJavaScript(
        `document.querySelectorAll('.palette-item').length`
      )
      report.paletteHighlights = await win.webContents.executeJavaScript(
        `document.querySelectorAll('.palette-match').length`
      )
      if (!args.includes('--keep-palette')) {
        await win.webContents.executeJavaScript(
          `document.querySelector('.palette-backdrop').click()`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Keeping the palette up for a screenshot means not stacking prefs on it.
      if (!args.includes('--keep-palette')) {
        win.webContents.send('menu:command', 'preferences')
        await new Promise((resolve) => setTimeout(resolve, 800))
        report.prefsOpen = await win.webContents.executeJavaScript(
          `document.getElementById('prefs-sheet').open === true`
        )
        report.prefsControls = await win.webContents.executeJavaScript(
          `document.querySelectorAll('.prefs-row').length`
        )
      }
    }

    // Force a theme for screenshots; by default the app follows the OS.
    const theme = flag('theme', '')
    if (theme) {
      await win.webContents.executeJavaScript(
        `document.documentElement.dataset.theme = ${JSON.stringify(theme)}`
      )
      await new Promise((resolve) => setTimeout(resolve, 400))
    }

    // Optionally scroll first, to inspect content below the fold.
    const scroll = Number(flag('scroll', 0))
    if (scroll) {
      await win.webContents.executeJavaScript(
        `document.querySelector('.cm-scroller').scrollTop = ${scroll}`
      )
      await new Promise((resolve) => setTimeout(resolve, 600))
    }

    if (docxOut) {
      win.webContents.send('menu:command', 'file:export-docx')
      await new Promise((resolve) => setTimeout(resolve, 2500))
      const written = fs.existsSync(path.resolve(docxOut))
      report.docxExported = written
      report.docxBytes = written ? fs.statSync(path.resolve(docxOut)).size : 0
    }

    const image = await win.webContents.capturePage()
    fs.writeFileSync(outPath, image.toPNG())

    console.log('--- smoke report ---')
    console.log(JSON.stringify(report, null, 2))
    console.log('screenshot:', outPath)

    if (report.fatal) {
      console.error('SMOKE FAIL: renderer crashed during boot:\n', report.fatal)
      app.exit(1)
      return
    }
    if (!report.hasEditor) {
      console.error('SMOKE FAIL: editor never mounted')
      app.exit(1)
      return
    }
    if (errors.length) {
      console.error('SMOKE FAIL: renderer console errors:\n', errors.join('\n'))
      app.exit(1)
      return
    }

    console.log('SMOKE PASS')
    app.exit(0)
  }, settleMs)
})
