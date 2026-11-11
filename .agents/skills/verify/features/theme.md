# Theme

The Auto / Dark / Light control in the top bar, next to "Terminal", and `[theme] mode` in `config.toml`. The choice is one value for all chat panes. **Auto** shows the active Omarchy theme. **Dark** shows the Omarchy theme that herdr's `[theme] dark_name` names, else the active theme, else the built-in dark colors. **Light** shows the theme that `light_name` names, else the built-in light colors. A click writes the value to `config.toml` through `POST /api/config`, and every open page shows it at once. A hand edit of the file shows in a few seconds, with no reload.

## Sub-features

- `th-default` marks Auto and shows the active Omarchy theme when there is no `[theme]` table.
- `th-click` writes `[theme] mode`, marks the chosen button and changes the colors of the page. The rest of the file, with its comments, stays as it was. A value that has a comment keeps the comment.
- `th-light` and `th-dark` use the `colors.toml` of `light_name` and `dark_name` (found as `omarchy theme dir` finds it).
- `th-builtin` has one copy of the built-in colors: `light-dark()` pairs in `index.html`, and `color-scheme` picks one.
- `th-keys` lets Tab reach each button and Enter choose it. The chosen button has `aria-pressed="true"`.
- `th-shared` shows a click in a second open page.
- `th-live` shows a hand edit of the file in both pages with no reload, and a reload keeps the choice.
- `th-refuse` answers 400 and leaves the file as it was for an unknown table or a bad value.

## How to get to it (user POV)

- Click Auto, Dark or Light at the top right of the chat page. Or write `[theme]` with `mode = "light"` in `herdr plugin config-dir rpbaptist.herdr-chat-view`.

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` sets `HERDR_CHAT_CONFIG=<run-dir>/config.toml` for the server. The journey writes a seed file there.
- The server reads `~/.config/herdr/config.toml` (or `HERDR_CONFIG_PATH`) and the Omarchy theme files. The journey reads the same files for the expected colors. It fails when the light and dark backgrounds of this machine are the same.
- On a machine where the active theme is dark and `dark_name` is the same theme, Auto and Dark look the same. The journey checks the marked button and the file for them.

- **Journey.** `bun scripts/page.ts <run-dir> journeys/theme.ts`. It clicks the buttons, presses Tab and Enter, edits the file, reloads, and removes the file at the end.
- **Side effects.** The text of `config.toml` after each click, and the computed `background-color` of `body` in the page and in a second page.
- **Proof.** Screenshots of Auto, Light, Dark, Light with the keyboard focus, and the two built-in palettes. Look at the text, the code block, the chips, the composer and the control in the light screenshots.

## Gotchas

- Never write the user's own files. The verify server reads only `HERDR_CHAT_CONFIG` for writes, and reads the herdr config and the theme files without writing.
- The two 400 lines in `console.log` come from the refused writes of the journey.
- The server reads the files every 2 s, but a click applies at once. Wait with `until`, not with a fixed sleep.
