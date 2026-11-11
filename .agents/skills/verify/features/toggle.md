# Toggle and close

One action switches the focused agent between its terminal and the chat view. Only one view shows at a time. The other view waits in a tab of its own (`chat (hidden)` or `terminal (hidden)`), so a pane that the user splits next to the shown view cannot show both views. Each switch puts the shown view in the slot of the other view. The close action puts the terminal back in its slot and closes the chat pane.

## Sub-features

- `toggle-open` opens the chat pane in a tab of its own, then moves it into the slot of the agent pane. It records `{ chat, view }` in `panes.json` and focuses the chat.
- `toggle-switch` puts the other view in the slot of the shown view, and moves the shown view to a tab of its own. Toggle from the agent pane shows the chat. Toggle from the chat pane, or the `Terminal` button, shows the terminal.
- `toggle-again` does not move panes when the requested view already shows. It only focuses that view.
- `single-view` keeps one view visible after the user splits a new pane next to it (issue #14).
- `toggle-no-agent` shows a "No agent in this pane" notification on a plain shell pane.
- `close` puts the terminal back in its slot, closes the chat pane and its tab, and focuses the agent.
- `recover` handles panes that are gone: a chat pane that the user closed, a chat pane that a herdr restart turned into a plain shell, and an agent pane that the user closed.
- `restore` is the `[[startup]]` hook. After a herdr restart it gives each agent its slot back and closes the shell that was its chat pane.

## How to get to it (user POV)

- Press the bound key (README example: `prefix+i`), which runs plugin action `rpbaptist.herdr-chat-view.toggle`.
- Click `Terminal` (`#term`) in the chat header to go back to the terminal.
- Run the plugin action "Chat view: close".

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` has already run `toggle-open`.
- Source `run.env` and unset `HERDR_PANE_ID`.

- **Single view.** `bun scripts/page.ts <run-dir> journeys/single-view.ts`. It splits a new pane from the chat pane, clicks `#term`, toggles from the agent pane, and repeats each switch once. After each step only one view and the new pane show in the tab, and the shown view has the slot of the other view. It saves the layout, the tab list and the pane list of each step as JSON. It closes the new pane at the end.
- **Lifecycle.** `bun scripts/page.ts <run-dir> journeys/view-lifecycle.ts`. It runs close twice, opens a new chat, closes that chat pane by hand and toggles again. Run it last: it replaces the chat pane, so `CHAT_PANE` in `run.env` is stale after it and `doctor.sh` fails.
- **Toggle from the chat pane.** Run `HERDR_PANE_ID=$CHAT_PANE bun "$CHECKOUT/herdr-chat.ts" toggle`. `herdr pane list` shows the agent pane in the tab where the chat pane was, and the chat pane alone in a `chat (hidden)` tab.
- **No agent.** Run `herdr pane split "$CHAT_PANE" --direction down --no-focus` to make a plain shell pane. Then run toggle with `HERDR_PANE_ID` set to that pane. The exit code is 0 and no chat pane opens for it: `panes.json` in `$STATE_DIR` does not get it.
- **Restart.** Run `herdr session stop "$RUN"`, start the server again as `up.sh` does, then run `bun "$CHECKOUT/herdr-chat.ts" restore` with `HERDR_SOCKET_PATH` set. The chat pane is a plain shell before `restore` and gone after it, and the agent pane has its slot back.
- **Proof.** Keep the JSON files and screenshots in `<run-dir>/single-view/` and `<run-dir>/view-lifecycle/`.

## Gotchas

- The verify session runs the linked plugin's manifest, not the checkout's. So herdr does not run the checkout's `[[startup]]` hook there. Run `restore` by hand.
- After a restart, herdr resumes the agent session in the agent pane with the real `claude --resume <session>`, not the fixture. Do not prompt it. Run `down.sh` after the test.
- `herdr pane move` refuses a zoomed tab. The switch turns the zoom off first.
- During a switch, `herdr pane layout` can show a state between the moves. Poll until the layout has the panes that you expect, then assert.
- The notification goes to the headless session. Nobody sees it, so assert on state.
