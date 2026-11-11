# Status bar settings popover

The gear at the right of the status bar, under the composer, opens a popover that edits `[status]` in `config.toml`. It shows or hides the mode pill, sets the `items` (built-in items, `"*"` and regexes: add, move up or down, remove) and the `hide` regexes (add, edit, remove). A chip button hides a chip that shows now: it adds the chip text as an anchored, escaped regex with each number as `\d+`, and focuses it for an edit. Each change is one `POST /api/config` and writes the file at once; the status bar is the live preview. The server refuses a value that gives a config error. The popover then shows the error under the field and keeps the text. When the file already has an error, the popover shows only the error.

## Sub-features

- `ss-open` opens the popover from `#gear` and puts the focus in it. `aria-expanded` follows.
- `ss-mode` writes `mode` with the checkbox (Space or a click). `#mode` follows.
- `ss-items` adds a built-in item (`add:<name>`), adds a regex item (`items:new` and Enter), moves an item (`items:<i>:up`, `items:<i>:down`, by click or Enter), and removes an item, `"*"` too. Without `"*"` only the listed items show.
- `ss-quick-hide` hides a chip that shows now (`Hide <chip text>` button). The regex shows in `hide:<i>` with the focus, and in a note. The chip stays hidden when its number changes.
- `ss-hide-edit` edits a hide regex in place (Enter or blur writes it).
- `ss-refuse` shows the server error under the field for a bad regex, keeps the text and leaves the file as it was.
- `ss-config-error` shows the config error and no edit controls while the file has an error.
- `ss-keys` keeps the popover keys from the agent: Shift+Tab, Esc and Enter in the popover do not change the agent mode, interrupt, or send. Esc and a click outside close the popover and focus `#input`.
- `ss-look` fits a 500 px pane, follows the dark and the light theme, and scales with `[font] size`.

## How to get to it (user POV)

- Click the gear at the right end of the chips under the message box.

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` sets `HERDR_CHAT_CONFIG=<run-dir>/config.toml` for the server. The journey writes a seed file there with a comment and an `[input]` table.
- The fixture footer shows `42% context`, and the message `context <n>` changes the number. A run that `up.sh` started before this change has the old fixture: start a new run.

- **Journey.** `bun scripts/page.ts <run-dir> journeys/status-settings.ts`. It drives the popover with clicks and keys, sends `context 43` to change the chip number, writes a bad file and a `[font]` table by hand, and switches the theme. At the end it sends `context 42`, sets the agent mode back to 0 and removes the file.
- **Side effects.** After each step, the `#status .seg` texts and the exact text of `config.toml` (the comment and `[input]` stay). The agent screen (`mode: <n>`, `❯ keepme`) and the transcript length show that no popover key reached the agent.
- **Proof.** Screenshots of the open popover, the items, the quick hide, the bad regex, the config error, the popover in the dark and the light theme, at 500 px, and at 500 px with a large font.

## Gotchas

- The 400 lines in `console.log` come from the refused bad regex.
- The fixture cannot enter `blocked`, so the answer keys of the blocked panel are not driven. The popover stops all its keys at its root, the same path as Esc and Shift+Tab.
- The journey changes the theme to dark and then light in the file. It removes the file at the end, so the next journey starts at Auto.
