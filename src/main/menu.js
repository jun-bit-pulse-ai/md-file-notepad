const { app, Menu, shell } = require('electron')
const path = require('node:path')

/**
 * Builds the application menu. Every entry sends a named command to the
 * focused window, so the renderer owns the behaviour and the menu stays a
 * thin dispatcher.
 */
function buildMenu({ store, send, onOpenFile, onOpenRecent, onClearRecent, onNewWindow }) {
  const isMac = process.platform === 'darwin'
  const cmd = (name) => () => send(name)

  const recentFiles = store.get('recentFiles') || []
  const recentItems = recentFiles.length
    ? [
        ...recentFiles.slice(0, 10).map((filePath) => ({
          label: path.basename(filePath),
          toolTip: filePath,
          click: () => onOpenRecent(filePath),
        })),
        { type: 'separator' },
        { label: 'Clear Menu', click: onClearRecent },
      ]
    : [{ label: 'No Recent Documents', enabled: false }]

  const template = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'Cmd+,',
          click: cmd('preferences'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New',
        accelerator: 'CmdOrCtrl+N',
        click: cmd('file:new'),
      },
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => onNewWindow(),
      },
      {
        label: 'Open…',
        accelerator: 'CmdOrCtrl+O',
        click: () => onOpenFile(),
      },
      {
        label: 'Quick Open…',
        accelerator: 'CmdOrCtrl+P',
        click: cmd('file:quick-open'),
      },
      { label: 'Open Recent', submenu: recentItems },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: cmd('file:save'),
      },
      {
        label: 'Save As…',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: cmd('file:save-as'),
      },
      { type: 'separator' },
      {
        label: 'Export',
        submenu: [
          { label: 'Word (.docx)…', click: cmd('file:export-docx') },
          { label: 'HTML…', click: cmd('file:export-html') },
          { label: 'PDF…', click: cmd('file:export-pdf') },
        ],
      },
      { type: 'separator' },
      {
        label: 'Reveal in Finder',
        accelerator: 'CmdOrCtrl+Alt+R',
        click: cmd('file:reveal'),
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  })

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      {
        label: 'Paste as Plain Text',
        accelerator: 'CmdOrCtrl+Shift+V',
        click: cmd('edit:paste-plain'),
      },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Find…',
        accelerator: 'CmdOrCtrl+F',
        click: cmd('edit:find'),
      },
      {
        label: 'Find and Replace…',
        accelerator: 'CmdOrCtrl+Alt+F',
        click: cmd('edit:replace'),
      },
      { type: 'separator' },
      {
        label: 'Copy as Markdown',
        accelerator: 'CmdOrCtrl+Shift+C',
        click: cmd('edit:copy-markdown'),
      },
      { type: 'separator' },
      {
        label: 'Spelling',
        submenu: [
          {
            label: 'Check Spelling While Typing',
            type: 'checkbox',
            checked: store.get('spellcheck') !== false,
            click: cmd('edit:toggle-spellcheck'),
          },
          { type: 'separator' },
          {
            label: 'Show Spelling Suggestions',
            enabled: false,
            toolTip: 'Right-click a misspelled word to see suggestions',
          },
        ],
      },
    ],
  })

  template.push({
    label: 'Format',
    submenu: [
      {
        label: 'Bold',
        accelerator: 'CmdOrCtrl+B',
        click: cmd('format:bold'),
      },
      {
        label: 'Italic',
        accelerator: 'CmdOrCtrl+I',
        click: cmd('format:italic'),
      },
      {
        label: 'Strikethrough',
        accelerator: 'CmdOrCtrl+Shift+X',
        click: cmd('format:strikethrough'),
      },
      {
        label: 'Inline Code',
        accelerator: 'CmdOrCtrl+E',
        click: cmd('format:code'),
      },
      {
        label: 'Highlight',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: cmd('format:highlight'),
      },
      { type: 'separator' },
      {
        label: 'Link…',
        accelerator: 'CmdOrCtrl+K',
        click: cmd('format:link'),
      },
      {
        label: 'Image…',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: cmd('format:image'),
      },
      { type: 'separator' },
      {
        label: 'Heading',
        submenu: [1, 2, 3, 4, 5, 6].map((level) => ({
          label: `Heading ${level}`,
          accelerator: `CmdOrCtrl+${level}`,
          click: cmd(`format:heading-${level}`),
        })),
      },
      {
        label: 'Paragraph',
        accelerator: 'CmdOrCtrl+0',
        click: cmd('format:paragraph'),
      },
      { type: 'separator' },
      {
        label: 'Bullet List',
        accelerator: 'CmdOrCtrl+Shift+8',
        click: cmd('format:bullet-list'),
      },
      {
        label: 'Numbered List',
        accelerator: 'CmdOrCtrl+Shift+7',
        click: cmd('format:ordered-list'),
      },
      {
        label: 'Task List',
        accelerator: 'CmdOrCtrl+Shift+9',
        click: cmd('format:task-list'),
      },
      {
        label: 'Toggle Task Done',
        accelerator: 'CmdOrCtrl+Shift+D',
        click: cmd('format:toggle-task'),
      },
      { type: 'separator' },
      {
        label: 'Blockquote',
        accelerator: 'CmdOrCtrl+Shift+Q',
        click: cmd('format:quote'),
      },
      {
        label: 'Code Block',
        accelerator: 'CmdOrCtrl+Alt+C',
        click: cmd('format:code-block'),
      },
      {
        label: 'Table',
        accelerator: 'CmdOrCtrl+Alt+T',
        click: cmd('format:table'),
      },
      {
        label: 'Horizontal Rule',
        accelerator: 'CmdOrCtrl+Alt+H',
        click: cmd('format:hr'),
      },
    ],
  })

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Toggle Source Mode',
        accelerator: 'CmdOrCtrl+/',
        click: cmd('view:source-mode'),
      },
      {
        label: 'Toggle Focus Mode',
        accelerator: 'CmdOrCtrl+Shift+F',
        click: cmd('view:focus-mode'),
      },
      {
        label: 'Toggle Typewriter Mode',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: cmd('view:typewriter-mode'),
      },
      { type: 'separator' },
      {
        label: 'Outline',
        accelerator: 'CmdOrCtrl+Shift+1',
        click: cmd('view:outline'),
      },
      {
        label: 'Files',
        accelerator: 'CmdOrCtrl+Shift+2',
        click: cmd('view:files'),
      },
      { type: 'separator' },
      {
        label: 'Appearance',
        submenu: [
          { label: 'System', click: cmd('view:theme-system') },
          { label: 'Light', click: cmd('view:theme-light') },
          { label: 'Dark', click: cmd('view:theme-dark') },
        ],
      },
      {
        label: 'Text Width',
        submenu: [
          { label: 'Narrow', click: cmd('view:width-narrow') },
          { label: 'Normal', click: cmd('view:width-normal') },
          { label: 'Wide', click: cmd('view:width-wide') },
          { label: 'Full', click: cmd('view:width-full') },
        ],
      },
      { type: 'separator' },
      {
        label: 'Actual Size',
        accelerator: 'CmdOrCtrl+0',
        visible: false,
        click: cmd('view:zoom-reset'),
      },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        click: cmd('view:zoom-in'),
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: cmd('view:zoom-out'),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'toggleDevTools' },
      { role: 'reload' },
    ],
  })

  template.push({
    role: 'window',
    submenu: isMac
      ? [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
        ]
      : [{ role: 'minimize' }, { role: 'close' }],
  })

  template.push({
    role: 'help',
    submenu: [
      {
        label: 'Markdown Reference',
        click: cmd('help:reference'),
      },
      {
        label: 'Keyboard Shortcuts',
        click: cmd('help:shortcuts'),
      },
      { type: 'separator' },
      {
        label: 'CommonMark Spec',
        click: () => shell.openExternal('https://commonmark.org/help/'),
      },
    ],
  })

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  return menu
}

module.exports = { buildMenu }
