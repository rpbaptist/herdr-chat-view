# Fonts

The `[font]` table of `config.toml` sets the text font (`sans`), the code and status chip font (`mono`), the body text size (`size`) and the code size (`mono_size`). The mono font defaults to the Omarchy font (`omarchy font current`, read once at server start), or `monospace`. A change to the file shows in the open page in a few seconds, with no reload.

## Sub-features

- `ft-default` uses the default stacks and sizes when there is no config: body 15px, code 13px, status chips 11.5px, the Omarchy font as mono.
- `ft-sans` and `ft-mono` change the font family. Each stack ends in `sans-serif` or `monospace`.
- `ft-size` scales the text elements with `size`, and `ft-mono-size` scales the code elements (pre, chips, spinner) with `mono_size`. One does not change the other.
- `ft-terminal` makes `sans = "terminal"` use the mono stack for the text.
- `ft-error` shows a bad value (a font name with a character outside letters, digits, spaces and `. _ + -`, or a size outside 8 to 40) in `#err` and uses the defaults.
- `ft-live` shows each change with no page reload.

## How to get to it (user POV)

- Write `config.toml` in `herdr plugin config-dir rpbaptist.herdr-chat-view`, and look at the chat text, the code blocks and the chips under the composer.

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` sets `HERDR_CHAT_CONFIG=<run-dir>/config.toml` for the server and writes it to `run.env`. The file does not exist at the start.
- The server runs `omarchy font current` once when it starts. The journey runs the same command to get the expected default mono font.

- **Journey.** `bun scripts/page.ts <run-dir> journeys/fonts.ts`. It writes the config file, reads computed styles of `body`, `#status .seg`, and a `pre` and a spinner that it adds to the page, and removes the file at the end.
- **Proof.** A screenshot for each config, the computed values in `steps.log`, the `#err` text, and a window marker that shows that the page did not reload.

## Gotchas

- Never write the user's own config file. The verify server reads only `HERDR_CHAT_CONFIG`.
- The font names in the journey need not be installed: the computed `font-family` is the CSS list, not the font that the browser uses.
- The server reads the file every 2 s. Wait with `until`, not with a fixed sleep.
