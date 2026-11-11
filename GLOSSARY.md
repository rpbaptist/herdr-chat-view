# Glossary

- **Footer**: the text below the last horizontal rule on the agent screen.
- **Mode pill**: the mode line of the footer, shown in the composer. A click or Shift+Tab cycles the mode.
- **Status bar**: the chips under the composer, and the mode pill. `config.toml` controls it.
- **Chip**: one item of the status bar. It is a *screen chip* or a *built-in item*.
- **Screen chip**: one segment of the footer lines other than the mode line. The footer splits into segments at wide gaps, or at spaces between color codes.
- **Built-in item**: a chip from herdr agent data, not from the screen (`kind`, `cwd`, `status`, `branch`).
- **Settings popover**: the panel that the gear next to the status bar opens. It edits `[status]` in `config.toml`, one key per change.
- **Dictation**: speech to text with a system tool (voxtype) that the microphone button starts and stops. The text goes into the draft. `[voice] tool` in `config.toml` selects the tool or turns it off.
- **Send key**: the key that sends the composer text, `enter` or `ctrl-enter`. `[input] send_key` in `config.toml` sets it.
- **Terminal font**: the mono font of the chat: code, status chips and the spinner. It is `monospace` unless `[font] mono` sets one. `sans = "terminal"` uses it for the text too.
- **Theme mode**: `auto`, `dark` or `light`, one value for all chat panes. The control in the top bar and `[theme] mode` in `config.toml` set it. Auto shows the `[theme] colors` file. Dark and light show the `dark_colors` and `light_colors` files.
