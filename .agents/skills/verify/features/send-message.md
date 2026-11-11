# Send a message

The user types a reply in the composer and presses Enter or the send button. The text goes to the agent as a prompt. The user message and the agent's reply then show in the chat, and the composer clears.

## Sub-features

- `send-enter` sends with Enter. Shift+Enter adds a new line.
- `send-button` sends with the `#send` button. The button is disabled while the composer is empty.
- `send-empty` sends nothing when the composer has only whitespace.
- `send-reply` shows the agent's reply after the user message.

## How to get to it (user POV)

- Click in the composer at the bottom of the chat pane, type, and press Enter.
- Type and click the round arrow button.

## Driving it with page.ts

Preconditions:

- Baseline state. The seeded `Fixture question` message is visible.

- **Send with Enter.** Run `bun scripts/page.ts <run-dir> journeys/send-message.ts`. The journey types `verify <timestamp>` into `#input` and presses Enter. Then it waits for `.msg.user` with that text and `.msg.assistant` with `echo: verify <timestamp>`.
- **Side effects.** The same journey checks these results: `#input` is empty; the transcript has the user entry; the agent pane shows `last: verify <timestamp>`; and `#err` is empty.
- **Send with the button.** In a journey, do `fill("#input", text)` and `click("#send")`. Expect the same items as for Enter.
- **Empty send.** Do `fill("#input", "   ")`, `press("#input", "Enter")`, and wait 1 s. The transcript line count does not change, and `#send` is still disabled.
- **Proof.** `<run-dir>/send-message/01-before.png`, `02-typed.png`, `03-after.png`, and `steps.log`.

## Gotchas

- The fixture echoes at once. A real agent replies later, and its `agent_status` changes to `working` first.
- `herdr agent prompt` sends the text and Enter. The fixture runs in raw mode and submits on `\r`. A multi-line prompt comes as a bracketed paste. The fixture removes the paste markers and keeps the new lines.
- Each run uses a unique text, so a reply from an earlier send cannot satisfy the wait.
