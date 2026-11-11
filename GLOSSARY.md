# Glossary

- **Footer**: the text below the last horizontal rule on the agent screen.
- **Mode pill**: the mode line of the footer, shown in the composer. A click or Shift+Tab cycles the mode.
- **Status bar**: the chips under the composer, and the mode pill. `config.toml` controls it.
- **Chip**: one item of the status bar. It is a *screen chip* or a *built-in item*.
- **Screen chip**: one segment of the footer lines other than the mode line. The footer splits into segments at wide gaps, or at spaces between color codes.
- **Built-in item**: a chip from herdr agent data, not from the screen (`kind`, `cwd`, `status`, `branch`).
- **Send key**: the key that sends the composer text, `enter` or `ctrl-enter`. `[input] send_key` in `config.toml` sets it.
- **Terminal font**: the mono font of the chat: code, status chips and the spinner. It is the Omarchy font unless `[font] mono` sets one. `sans = "terminal"` uses it for the text too.
- **Theme mode**: `auto`, `dark` or `light`, one value for all chat panes. The control in the top bar and `[theme] mode` in `config.toml` set it. Auto shows the active Omarchy theme. Dark and light show the theme that `dark_name` and `light_name` in herdr's `[theme]` name.
