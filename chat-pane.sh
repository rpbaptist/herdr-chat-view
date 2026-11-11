#!/usr/bin/env bash
# Show the chat page in this pane with pixel: a web view in the terminal,
# without browser chrome. The first run installs pixel and its patched Electron.
set -u
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
pixel=$dir/node_modules/@zenbu-labs/pixel

if [[ ! -f $pixel/electron/dist/.zenbu-electron-sha256 ]]; then
  echo "Installing pixel (one time, about 120 MB)..."
  # pixel moves the unpacked Electron out of TMPDIR; /tmp is another filesystem here.
  mkdir -p "$HOME/.cache/herdr-chat/tmp"
  (cd "$dir" && TMPDIR=$HOME/.cache/herdr-chat/tmp bun install --frozen-lockfile) || { read -rp "pixel install failed. Press Enter to close."; exit 1; }
fi

# The terminal colors for the chat theme: herdr answers with the host terminal colors.
[[ -n ${HERDR_CHAT_COLORS:-} ]] && bun "$dir/terminal-colors.ts" "$HERDR_CHAT_COLORS"
node "$pixel/dist/bin.js" "$dir" && exit
read -rp "pixel failed, see ~/.local/state/pixel/logs/herdr-chat-view.stderr.log. Press Enter to close."
