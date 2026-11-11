# Send key

`[input] send_key` in `config.toml` sets the key that sends the composer text: `"enter"` (default) or `"ctrl-enter"`. In `ctrl-enter` mode, Enter and Shift+Enter add a new line, and Ctrl+Enter or Cmd+Enter sends. The send button tooltip shows the active key. A change to the file shows in the open page in a few seconds, with no reload.

## Sub-features

- `sk-default` sends with Enter when there is no config file. The tooltip is `Send (Enter)`.
- `sk-ctrl` adds a new line with Enter and Shift+Enter, and sends with Ctrl+Enter. The tooltip is `Send (Ctrl+Enter)`.
- `sk-popup` keeps Enter and Tab in the auto-complete popup in both modes: they pick the item and send nothing.
- `sk-error` shows a bad `send_key` value in `#err` and uses Enter.
- `sk-live` shows each change with no page reload.

## How to get to it (user POV)

- Write `config.toml` in `herdr plugin config-dir rpbaptist.herdr-chat-view`, and press Enter in the composer.

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` sets `HERDR_CHAT_CONFIG=<run-dir>/config.toml` for the server and writes it to `run.env`. The file does not exist at the start.

- **Journey.** `bun scripts/page.ts <run-dir> journeys/send-key.ts`. It presses real keys in `#input`, writes the config file, waits for the tooltip, and removes the file at the end.
- **Side effects.** The transcript has one user entry with the three lines, and the agent pane shows `last: <text>`.
- **Proof.** A screenshot for each mode, the composer value after each key, the transcript, and a window marker that shows that the page did not reload.

## Gotchas

- Not covered: IME composition (`e.isComposing`) and the answer keys for a blocked agent. The fixture cannot enter `blocked`, and a headless key press does not start a composition.
- The server reads the file every 2 s. Wait with `until`, not with a fixed sleep.
- Never write the user's own config file. A run that `up.sh` started before `HERDR_CHAT_CONFIG` existed reads the user's file: start a new run.
