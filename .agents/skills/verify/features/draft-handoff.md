# Draft handoff

A draft follows the user. When the user goes from the chat to the terminal, the server types the composer text into Claude's empty input box. When the user comes back to the chat while Claude is idle, the server moves the input-box text into the composer and clears the box.

## Sub-features

- `draft-to-terminal` types the composer draft into an empty Claude input box and clears the draft.
- `draft-keep` does not type when the input box already has text.
- `draft-to-chat` moves the input-box text into the composer (appended after an existing draft) and clears the box with Esc Esc, only when the agent is `idle` or `done`.
- `draft-persist` keeps the draft on the server, so a reloaded page shows it.

## How to get to it (user POV)

- Type in the composer, then press the toggle key or click `Terminal`.
- Type in Claude's input box, then press the toggle key to go back to the chat.

## Driving it with page.ts

Preconditions:

- Baseline state. The fixture input box is empty: `j.agentScreen()` shows `❯ Type a message`.

- **To the terminal.** Do `fill("#input", "draft A")` and wait 500 ms for the save. Then click `#term`. Within 3 s, `j.agentScreen()` shows `❯ draft A`, and `#input` has the value `""`.
- **To the chat.** The fixture input box still has `draft A` from the last step. Run the toggle action from the agent pane: `Bun.spawnSync(["bun", run.CHECKOUT + "/herdr-chat.ts", "toggle"], { env: { ...process.env, HERDR_SOCKET_PATH: run.HERDR_SOCKET_PATH, HERDR_PANE_ID: run.AGENT_PANE } })`. `#input` then has `draft A`, and the agent screen shows `❯ Type a message` again.
- **Keep.** Go to the terminal again (click `#term`). Type `x` into the fixture with `j.herdr("pane","send-text",run.AGENT_PANE,"x")`. Then repeat "To the terminal" with `draft B`. The agent screen shows `❯ x`, not `draft B`.
- **Proof.** Take page screenshots and `agentScreen()` text before and after each switch. Save them to `<run-dir>/draft-handoff/`.

## Gotchas

- The draft saves on an `input` event with a short delay. Playwright `fill` sends the event, but wait before you click.
- `draft-to-chat` runs only for `claude` in `idle` or `done`. The fixture is always idle. A test for the "working" guard needs a fixture that has a working state.
- The server reads the input box between the last two horizontal rules. The fixture draws those rules. A change to `readInput` must keep the fixture's box shape the same as real Claude's, or the journey proves nothing.
