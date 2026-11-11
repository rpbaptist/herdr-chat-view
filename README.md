# herdr-chat-view

A [herdr](https://herdr.dev) plugin that shows a chat view of an agent session
next to its terminal. It is for local use only. It is not a herdr replacement.

- One key switches the focused agent between its terminal and the chat view.
  The shown view takes the place of the other one. The other view keeps
  running in a tab of its own (`chat (hidden)` or `terminal (hidden)`), so a
  pane that you split next to the view does not show both. After a herdr
  restart, the terminal gets its place back and the chat pane closes.
- The chat reads the agent's own transcript (Claude Code, Codex) and sends
  messages back with `herdr agent prompt`. Other agents show their screen.
- The page is drawn in the pane with [pixel](https://pixelgui.com), so there is
  no browser toolbar. Colors come from the herdr theme first, and from the
  terminal second.
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
under the message box, the send key, the fonts, the theme and dictation. Without the file, the status
bar shows the agent's footer as it is, Enter sends, and the microphone button
uses voxtype when it is on `PATH`. The terms are in
[GLOSSARY.md](GLOSSARY.md).

```toml
[input]
send_key = "enter"               # "enter" (default) or "ctrl-enter"

[theme]
mode = "auto"                    # "auto" (default), "dark" or "light"

[font]
sans = "Inter, Helvetica"        # text font; "terminal" = use the mono font
mono = "JetBrainsMono Nerd Font" # code and chip font; default: monospace
size = 15                        # text size in px (8 to 40)
mono_size = 13                   # code size in px (8 to 40)

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

- The gear at the right of the status bar opens the **settings popover**. It
  edits `[status]` in the same file: the mode pill, the `items` (add a built-in
  item, `"*"` or a regex; move an item up or down; remove it) and the `hide`
  regexes (add, edit, remove). A chip button under "Hide a chip that shows now"
  adds a `hide` regex for that chip: its whole text, escaped, with each number
  as `\d+`, so `42% context` stays hidden at 43%. Each change writes the file at
  once with the same text edit as the theme control, and the status bar shows
  it. The page refuses a value that gives a config error (for example a bad
  regex), shows the error under the field and keeps your text. When the file
  already has an error, the popover shows it and does not write. Esc or a click
  outside closes the popover, and the focus goes back to the message box.

- `input.send_key` (default `"enter"`) sets the key that sends the message. With
  `"ctrl-enter"`, Enter and Shift+Enter add a new line, and Ctrl+Enter or
  Cmd+Enter sends. The send button tooltip shows the active key. The
  auto-complete popup still takes Enter and Tab, and the answer keys for a
  blocked agent do not change.

- `theme.mode` (default `"auto"`) sets the colors. The control at the top right
  of the page (Auto, Dark, Light) writes it, and so does a hand edit; every open
  page follows. The page reads the `[theme]` table of herdr's `config.toml`
  (`HERDR_CONFIG_PATH`, else `~/.config/herdr/config.toml`) the same way herdr
  does. `auto` shows the theme that herdr shows: `name`, or with `auto_switch`
  the `dark_name` or `light_name` theme for the terminal background. `dark` and
  `light` show `dark_name` and `light_name`. When one is not set, herdr's pair
  of `name` applies (`gruvbox` and `gruvbox-light`, for example).
  `[theme.custom]`, `[theme.custom.dark]`, `[theme.custom.light]` and
  `[ui] accent` apply as in herdr. It does not follow the light or dark setting
  of the host. The page control writes the file with a text edit that keeps all
  other text and comments, and refuses a value that gives a config error.

  The colors come from herdr first and the terminal second. The herdr theme
  gives the background (`panel_bg`), the text, the muted text, the accent, the
  state colors and the selection. A herdr color that is an ANSI name, or the
  terminal default (the `terminal` theme), takes the terminal color. The ANSI
  colors 0 to 15 of the agent screen come from the terminal only. The chat pane
  asks the terminal for its colors (OSC 10, 11 and 4) when it opens. In a
  herdr pane, herdr answers with the colors of the host terminal. A color that
  neither source gives keeps the built-in color of the page. The server reads
  herdr's config every 2 seconds, and only reads it. The terminal colors
  update when a chat pane opens.

- `font.sans` (default `"Inter", "Geist", system-ui, ...`) sets the text font.
  `"terminal"` uses the mono font, so the whole chat uses the terminal font.
- `font.mono` (default `monospace`) sets the font for code,
  the status chips and the spinner. Both fonts take one family name or a comma
  separated list. Names may have letters, digits, spaces and `. _ + -` only.
  Each list ends in `sans-serif` or `monospace`, so Nerd Font glyphs still
  show.
- `font.size` (default `15`) and `font.mono_size` (default `13`) set the sizes
  in px, from 8 to 40. All other text sizes scale with them. They are config
  settings only, with no zoom key in the page.

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
the config text editor, the status bar model, the theme, the fonts and the
dictation tool descriptor.
The `verify` skill in `.claude/skills/verify` drives the plugin end to end.

## Files

| File | Purpose |
| --- | --- |
| `herdr-chat.ts` | `toggle` and `close` actions, the `restore` startup hook, and the local chat server |
| `transcripts.ts` | Claude Code and Codex transcript and skill-list parsers |
| `agents.ts` | One descriptor for each agent kind: parsers, transcript lookup, skill trigger, built-in commands |
| `screen.ts` | Reads Claude's input box and footer from the agent screen |
| `config.ts` | Parses `config.toml`: one table, one parser; checks an edit before it is written |
| `config-edit.ts` | Sets one key in `config.toml` text and keeps the rest of the file |
| `branches.ts` | The git branch of a working directory, cached |
| `status.ts` | The status bar model: the footer, filtered and ordered by `config.toml` |
| `voice.ts` | Dictation: one descriptor per tool (commands, status, result file), and one dictation from start to text |
| `theme.ts` | Parses `[theme]`, picks the theme for the mode, and turns its colors into CSS variables |
| `fonts.ts` | Parses `[font]` and builds the font CSS variables |
| `index.html` | The chat page |
| `chat-pane.sh`, `chat-view.cjs` | Runs the page in the pane with pixel |

The server listens on `127.0.0.1` only, with a random token in the URL. It
stops after 10 minutes with no open chat page.
