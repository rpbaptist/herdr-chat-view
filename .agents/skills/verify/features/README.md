# herdr-chat-view verification map

This directory is the maintained source for verifying what a user of herdr-chat-view sees and does. Read this index before you drive the app. Then use the matching feature file as the recipe.

## Baseline preconditions

- Start an instance with `scripts/up.sh [checkout]` and keep the `<run-dir>` it prints.
- `scripts/doctor.sh <run-dir>` passes all checks.
- The agent pane runs the fixture agent: `claude`, `idle`, with the seeded transcript (`fixtures/seed.jsonl`).
- `up.sh` has already run the toggle action once. So the chat pane shows and has focus, and the agent pane waits in a `terminal (hidden)` tab.
- Never drive an instance that this run did not start.

## Driving conventions

- Drive the page with `bun scripts/page.ts <run-dir> <journey.ts>`. For a feature that has no shipped journey, write the journey in `<run-dir>/` and keep it with the evidence.
- Use element ids (`#input`, `#term`, `#mode`) and item classes (`.msg.user`, `details.steps`). Do not use positions or coordinates.
- Run herdr commands with the run's socket. Source `run.env` and unset `HERDR_PANE_ID` first.
- Run plugin actions as the keybinding runs them, from the checkout: `HERDR_PANE_ID=<pane> bun "$CHECKOUT/herdr-chat.ts" <action>`.

## Proof and skip reporting

- Capture the page before and after each user action.
- Show every side effect from a second view. Examples: a transcript line, the agent pane screen, the pane layout and the tab of each pane.
- Report each feature ID with the entry point that you used.
- If a precondition cannot be met (for example, the fixture has no `blocked` state), report the feature as not verified and name the precondition. Do not prove it through another path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph about the behavior that the user sees. Then it has exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with page.ts`, and `Gotchas`.

## Features

- [Send a message](./send-message.md) covers the composer, sending with Enter or the button, and the reply that comes back. Journey: `journeys/send-message.ts`. Status: proven.
- [Transcript view](./transcript.md) covers how the agent's transcript shows: messages, markdown, tool-step groups, hidden meta lines, and live appends.
- [Toggle and close](./toggle.md) covers the toggle action that switches between the terminal and the chat, the close action, and recovery after closed panes or a herdr restart. Journeys: `journeys/single-view.ts`, `journeys/view-lifecycle.ts` (run it last). Status: proven.
- [Draft handoff](./draft-handoff.md) covers how a draft moves between the composer and Claude's input box when you switch views.
- [Status bar config](./status-bar.md) covers `config.toml`: hidden, moved and built-in chips, `mode = false`, config errors, and live reload. Journey: `journeys/status-bar.ts`. Status: proven.
- [Agent controls and status](./agent-controls.md) covers the mode pill (Shift+Tab), the footer status segments, interrupt, and the blocked-answer panel.
- [Auto-complete](./autocomplete.md) covers the `/` and `$` popup for skills and built-in commands. Journey: `journeys/autocomplete.ts`. Status: proven.
