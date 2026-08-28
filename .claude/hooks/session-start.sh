#!/bin/bash
#
# SessionStart hook: prepares the repo so tests, the build and the smoke
# test all work immediately in a Claude Code on the web session.
#
# Runs synchronously, so the session does not start until dependencies are
# ready. That costs a little startup latency but removes the race where the
# agent runs `npm test` before node_modules exists.
set -euo pipefail

# Local sessions manage their own environment; only set up remote ones.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

echo "[session-start] installing npm dependencies…"
# `install` rather than `ci`: it reuses whatever the cached container image
# already has, and the container state is cached after this hook completes.
npm install --no-audit --no-fund

# npm's postinstall does not reliably leave the Electron binary in place in
# every environment. Tests do not need it, but `npm run smoke` and
# `npm start` do, so fetch it here — without failing the session if the
# download is unavailable.
if [ ! -x "node_modules/electron/dist/electron" ]; then
  echo "[session-start] fetching the Electron binary…"
  node node_modules/electron/install.js \
    || echo "[session-start] WARNING: Electron binary unavailable; tests still work, 'npm run smoke' will not"
fi

# build/ is gitignored, so a fresh clone has no renderer bundle. Building it
# now means the app is launchable without a separate step.
echo "[session-start] building the renderer bundle…"
npm run build --silent

echo "[session-start] ready: 'npm test' runs the suite, 'npm run smoke' boots the app"
