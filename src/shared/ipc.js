/**
 * Channel names shared between the main and renderer processes.
 * Kept in one place so a typo fails loudly at import time rather than
 * silently dropping messages.
 */
const IPC = {
  // renderer -> main (invoke/handle)
  FILE_NEW: 'file:new',
  FILE_OPEN: 'file:open',
  FILE_OPEN_PATH: 'file:open-path',
  FILE_SAVE: 'file:save',
  FILE_SAVE_AS: 'file:save-as',
  FILE_EXPORT_HTML: 'file:export-html',
  FILE_EXPORT_PDF: 'file:export-pdf',
  FILE_REVEAL: 'file:reveal',
  FILE_LIST_DIR: 'file:list-dir',
  FILE_READ: 'file:read',
  RECENT_LIST: 'recent:list',
  RECENT_CLEAR: 'recent:clear',
  PREFS_GET: 'prefs:get',
  PREFS_SET: 'prefs:set',
  DOC_STATE: 'doc:state',
  CONFIRM_DISCARD: 'dialog:confirm-discard',
  OPEN_EXTERNAL: 'shell:open-external',

  // main -> renderer (send/on)
  MENU_COMMAND: 'menu:command',
  LOAD_DOCUMENT: 'doc:load',
  REQUEST_SAVE: 'doc:request-save',
  THEME_CHANGED: 'theme:changed',
  FILE_CHANGED_ON_DISK: 'file:changed-on-disk',
}

module.exports = { IPC }
