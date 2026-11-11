# Toggle and close

One action switches the focused agent between its terminal and the chat view. The first run opens the chat pane in a split to the right and zooms it. Each later run zooms the other pane. The other pane keeps running behind the zoomed one. The close action removes the chat pane and shows the terminal.

## Sub-features

- `toggle-open` opens the chat pane, records it, and zooms and focuses it.
- `toggle-switch` switches the zoom and focus between the chat pane and the agent pane.
- `toggle-from-chat` works when you run the action from the chat pane.
- `toggle-no-agent` shows a "No agent in this pane" notification on a plain shell pane.
- `close` closes the chat pane and focuses the agent, with no zoom.

## How to get to it (user POV)

- Press the bound key (README example: `prefix+i`), which runs plugin action `rpbaptist.herdr-chat-view.toggle`.
- Click `Terminal` (`#term`) in the chat header to go back to the terminal.
- Run the plugin action "Chat view: close".

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` has already run `toggle-open`.
- Source `run.env` and unset `HERDR_PANE_ID`.

- **Opened state.** Run `herdr pane layout --pane "$AGENT_PANE" | jq '.result.layout | {zoomed, focused_pane_id}'`. The result is `zoomed: true` with `focused_pane_id` equal to `$CHAT_PANE`.
- **Switch to the terminal.** Run `HERDR_PANE_ID=$CHAT_PANE bun "$CHECKOUT/herdr-chat.ts" toggle`. The layout is zoomed with focus on `$AGENT_PANE`.
- **Switch back.** Run `HERDR_PANE_ID=$AGENT_PANE bun "$CHECKOUT/herdr-chat.ts" toggle`. The layout is zoomed with focus on `$CHAT_PANE`.
- **Header button.** In a journey, click `#term`. Then `j.herdr("pane","layout","--pane",run.AGENT_PANE).layout.focused_pane_id` is `run.AGENT_PANE`.
- **No agent.** Run `herdr pane split --pane "$AGENT_PANE" --direction down --no-focus` to make a plain shell pane. Then run toggle with `HERDR_PANE_ID` set to that pane. The exit code is 0 and no chat pane opens for it: `panes.json` in `$STATE_DIR` does not get it.
- **Close.** Run `HERDR_PANE_ID=$AGENT_PANE bun "$CHECKOUT/herdr-chat.ts" close`. `herdr pane get "$CHAT_PANE"` fails, the layout is not zoomed, and `panes.json` does not have `$AGENT_PANE`. Run close last, because later journeys need the chat pane.
- **Proof.** Save each layout JSON to `<run-dir>/toggle/`, and take a page screenshot after the `#term` click.

## Gotchas

- `herdr plugin action invoke toggle` runs the copy at the linked plugin root, not the checkout under test. Use it only when the two are the same (`herdr plugin list`).
- The toggle action decides the view from the zoom state. A layout that a person or another plugin changes by hand can make the next toggle go the "wrong" way. Read the layout before you assert.
- The notification goes to the headless session. Nobody sees it, so assert on state.
