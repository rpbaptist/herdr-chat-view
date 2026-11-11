# herdr-chat-view

A [herdr](https://herdr.dev) plugin that shows a chat view of an agent session
next to its terminal. It is for local use only. It is not a herdr replacement.

- One key switches the focused agent between its terminal and the chat view.
  herdr zooms the pane, so the other pane keeps running behind it.
- The chat reads the agent's own transcript (Claude Code, Codex) and sends
  messages back with `herdr agent prompt`. Other agents show their screen.
- The page is drawn in the pane with [pixel](https://pixelgui.com), so there is
  no browser toolbar. Colors follow the active Omarchy terminal theme.
- Shift+Tab cycles the agent's mode, Esc interrupts. The agent's status line
  shows under the message box.
- A draft moves with you: from the chat into Claude's input box, and back.

Status: in daily use by the author, not yet published.

## Requirements

- herdr 0.9 or later, Bun, Node.js
- A terminal with the kitty graphics protocol (for example Ghostty or Kitty)

## Install (development)

```bash
git clone git@github.com:rpbaptist/herdr-chat-view.git
herdr plugin link "$PWD/herdr-chat-view"
```

The first chat pane installs pixel and its patched Electron (about 120 MB).

Bind the toggle in `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+i"
type = "plugin_action"
command = "rpbaptist.herdr-chat-view.toggle"
description = "Chat view: toggle terminal / chat"
```

## Tests

```bash
bun test
```

Unit tests cover the transcript parsers, the screen readers and the theme.

## Files

| File | Purpose |
| --- | --- |
| `herdr-chat.ts` | `toggle` and `close` actions, and the local chat server |
| `transcripts.ts` | Claude Code and Codex transcript parsers |
| `screen.ts` | Reads Claude's input box and footer from the agent screen |
| `theme.ts` | Omarchy theme colors as CSS variables |
| `index.html` | The chat page |
| `chat-pane.sh`, `chat-view.cjs` | Runs the page in the pane with pixel |

The server listens on `127.0.0.1` only, with a random token in the URL. It
stops after 10 minutes with no open chat page.
