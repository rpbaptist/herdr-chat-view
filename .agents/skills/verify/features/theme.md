# Theme

The Auto / Dark / Light control at the top of the settings popover (the gear at the right of the status bar), and `[theme] mode` in `config.toml`. The choice is one value for all chat panes. **Auto** shows the herdr theme that herdr shows (`name`, or the `dark_name` or `light_name` theme with `auto_switch`). **Dark** and **Light** show the `dark_name` and `light_name` themes. A color that the herdr theme does not give (the `terminal` theme, an ANSI name, and the ANSI colors 0 to 15) comes from the terminal colors file that the chat pane writes, else from the built-in colors. A click writes the value to `config.toml` through `POST /api/config`, and every open page shows it at once. A hand edit of the file shows in a few seconds, with no reload.

## Sub-features

- `th-default` marks Auto and shows the herdr theme when `[theme]` has no `mode`.
- `th-click` writes `[theme] mode`, marks the chosen button and changes the colors of the page. The rest of the file, with its comments, stays as it was. A value that has a comment keeps the comment.
- `th-light` and `th-dark` use the `light_name` and `dark_name` themes, else herdr's pair of `name`.
- `th-terminal` takes the background and the ANSI colors from the terminal colors file for herdr's `terminal` theme.
- `th-herdr-live` shows a change of herdr's theme with no reload.
- `th-builtin` has one copy of the built-in colors: `light-dark()` pairs in `index.html`, and `color-scheme` picks one.
- `th-keys` lets Tab reach each button and Enter choose it. The chosen button has `aria-pressed="true"`.
- `th-shared` shows a click in a second open page.
- `th-live` shows a hand edit of the file in both pages with no reload, and a reload keeps the choice.
- `th-refuse` answers 400 and leaves the file as it was for an unknown table or a bad value.

## How to get to it (user POV)

- Click the gear, then Auto, Dark or Light. Or write `[theme]` with `mode = "light"` in `herdr plugin config-dir rpbaptist.herdr-chat-view`.

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` sets `HERDR_CHAT_CONFIG=<run-dir>/config.toml` for the server. The journey writes a seed file there. `up.sh` also sets `HERDR_CONFIG_PATH=<run-dir>/herdr.toml`, and the journey writes the herdr theme there. It writes `<STATE_DIR>/terminal-colors.json` for the terminal step and puts back the file of the chat pane at the end.
- The headless herdr has no host terminal, so the chat pane query writes no file there. To prove the query itself, run `bun terminal-colors.ts <file>` in a pane of a herdr session that has a host terminal.

- **Journey.** `bun scripts/page.ts <run-dir> journeys/theme.ts`. It clicks the buttons, presses Tab and Enter, edits the file, reloads, and removes the file at the end.
- **Side effects.** The text of `config.toml` after each click, and the computed `background-color` of `body` in the page and in a second page.
- **Proof.** Screenshots of Auto, Light, Dark, Light with the keyboard focus, the herdr `terminal` theme with the terminal colors file, and the two built-in palettes. Look at the text, the code block, the chips, the composer and the control in the light screenshots.

## Gotchas

- Never write the user's own files. The verify server writes only `HERDR_CHAT_CONFIG`, and reads `HERDR_CONFIG_PATH` without writing.
- The two 400 lines in `console.log` come from the refused writes of the journey.
- The server reads the files every 2 s, but a click applies at once. Wait with `until`, not with a fixed sleep.
