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
  shows under the message box. An optional config file controls it.
- A draft moves with you: from the chat into Claude's input box, and back.
- A microphone button dictates into the message box with
  [voxtype](https://voxtype.io). The audio stays on the machine.

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

## Configuration

An optional `config.toml` in the plugin config directory
(`herdr plugin config-dir rpbaptist.herdr-chat-view`) controls the status bar
under the message box, the send key and dictation. Without the file, the status
bar shows the agent's footer as it is, Enter sends, and the microphone button
uses voxtype when it is on `PATH`. The terms are in
[GLOSSARY.md](GLOSSARY.md).

```toml
[input]
send_key = "enter"               # "enter" (default) or "ctrl-enter"

[voice]
tool = "auto"                    # "auto" (default), "voxtype" or "off"

[status]
mode = true                      # show the mode pill in the composer
hide = ["/\\d+% context/"]       # regexes on plain chip text; screen chips only; runs first
items = ["kind", "/^⎇/", "*"]    # order: built-in name | "/regex/flags" | "*" = remaining screen chips
```

- `mode` (default `true`) shows or hides the mode pill.
- `hide` (default `[]`) removes the screen chips that match a regex. A regex
  matches the chip text without colors. Write `/pattern/i` to ignore case.
- `items` (default `["*"]`) sets the order. A regex places all the screen
  chips that match and are not placed yet. `"*"` places all the other screen
  chips. A list without `"*"` shows only the listed items. The built-in items
  are `kind` (agent kind), `cwd` (the working directory, with `~` for home),
  `status` (the herdr agent status, in the state color) and `branch` (the git
  branch of the agent's working directory; no chip outside a git repository or
  on a detached HEAD). The server runs git only when `items` lists `branch`.

- `input.send_key` (default `"enter"`) sets the key that sends the message. With
  `"ctrl-enter"`, Enter and Shift+Enter add a new line, and Ctrl+Enter or
  Cmd+Enter sends. The send button tooltip shows the active key. The
  auto-complete popup still takes Enter and Tab, and the answer keys for a
  blocked agent do not change.

- `voice.tool` (default `"auto"`) sets the dictation tool. `"auto"` uses
  voxtype when it is on `PATH`. Without it, the button is disabled and its
  tooltip says why. `"off"` hides the button.

## Dictation

Click the microphone button to start, and click it again to stop. The button
is red while voxtype records, and shows a spinner while it transcribes. Then
the text comes after the draft in the message box. Esc cancels the dictation
while it runs; at other times Esc interrupts the agent, as before.

The server runs `voxtype record start --file=<file>`, `record stop`,
`record cancel` and `voxtype status`. voxtype records and transcribes on this
machine with its own model and settings, and writes the text to a file in the
plugin's private runtime directory. The server reads the file, deletes it, and
adds the text to the draft. The page never gets audio and needs no microphone
permission, and no key goes to the focused window. The voxtype daemon must run
(`systemctl --user status voxtype`). One dictation runs at a time; another chat
page shows the button disabled until it ends.

The server reads the file every 2 seconds, so open chat pages show a change
with no restart. If the file has an error (including an unknown table or
key), all settings use the defaults and the page shows the error in one line.

## Tests

```bash
bun test
```

Unit tests cover the transcript parsers, the screen readers, the config file,
the status bar model, the dictation tool descriptor and the theme.
The `verify` skill in `.claude/skills/verify` drives the plugin end to end.

## Files

| File | Purpose |
| --- | --- |
| `herdr-chat.ts` | `toggle` and `close` actions, and the local chat server |
| `transcripts.ts` | Claude Code and Codex transcript and skill-list parsers |
| `agents.ts` | One descriptor for each agent kind: parsers, transcript lookup, skill trigger, built-in commands |
| `screen.ts` | Reads Claude's input box and footer from the agent screen |
| `config.ts` | Parses `config.toml`: one table, one parser |
| `branches.ts` | The git branch of a working directory, cached |
| `status.ts` | The status bar model: the footer, filtered and ordered by `config.toml` |
| `voice.ts` | Dictation: one descriptor per tool (commands, status, result file), and one dictation from start to text |
| `theme.ts` | Omarchy theme colors as CSS variables |
| `index.html` | The chat page |
| `chat-pane.sh`, `chat-view.cjs` | Runs the page in the pane with pixel |

The server listens on `127.0.0.1` only, with a random token in the URL. It
stops after 10 minutes with no open chat page.
