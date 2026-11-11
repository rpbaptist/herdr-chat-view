# Status bar config

An optional `config.toml` controls the status bar under the composer. It can hide the mode pill, hide screen chips that match a regex, and set the order of the chips, with built-in items from herdr agent data. A change to the file shows in the open page in a few seconds, with no reload. A config error shows in `#err`, and the status bar then uses the defaults.

## Sub-features

- `sb-default` shows the screen chips in the agent's order when there is no config file.
- `sb-hide` hides the screen chips that match a `hide` regex.
- `sb-items` places chips in the `items` order (`"/regex/"`, `"*"`, built-in names).
- `sb-builtin` shows the `kind`, `cwd` and `status` built-in items as `#status .seg.builtin.<name>`. The `status` item has the herdr state color.
- `sb-mode` hides the mode pill with `mode = false`.
- `sb-error` shows a config error in `#err` and uses the defaults. The error goes away when the file is correct.
- `sb-live` shows each change with no page reload.

## How to get to it (user POV)

- Write `config.toml` in `herdr plugin config-dir rpbaptist.herdr-chat-view`, and look at the chips under the composer.

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` sets `HERDR_CHAT_CONFIG=<run-dir>/config.toml` for the server and writes it to `run.env`. The file does not exist at the start.

- **Journey.** `bun scripts/page.ts <run-dir> journeys/status-bar.ts`. It writes the config file, waits for the chips, and removes the file at the end.
- **Mode pill.** Press Shift+Tab to show the pill (mode 1), write `mode = false`, and wait until `#mode` is not `.on`.
- **Proof.** A screenshot for each config, the `#err` text, and a window marker that shows that the page did not reload.

## Gotchas

- Never write the user's own config file. The verify server reads only `HERDR_CHAT_CONFIG`. A run that `up.sh` started before this change has no `HERDR_CHAT_CONFIG` and reads the user's file: start a new run.
- The server reads the file every 2 s and the footer every 1 s. Wait with `until`, not with a fixed sleep.
