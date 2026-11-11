# Auto-complete

When the composer text starts with a trigger character, a popup above the composer lists the agent's matching skills and built-in commands, with a one-line description each. Claude Code uses `/` for both. Codex uses `/` for its commands and `$` for its skills. The user filters by typing, moves with Up and Down, and inserts with Tab or Enter.

## Sub-features

- `ac-skills` lists the skills from the transcript's `skill_listing` attachments (Claude Code) or its `### Available skills` section (Codex).
- `ac-builtin` lists the built-in commands of the agent kind (`completions.ts`).
- `ac-filter` matches fuzzy and case-insensitive. For `plugin:skill` names, the part after the colon also matches.
- `ac-keys` gives Tab, Enter, Up, Down and Esc to the popup only while it is open. When it is closed, the keys work as before.
- `ac-live` adds the skills from a later `skill_listing` (`isInitial: false`) without a page reload.

## How to get to it (user POV)

- Type `/` in the composer.
- Type more letters to filter. Press Tab or Enter to insert, or Esc to close.

## Driving it with page.ts

Preconditions:

- Baseline state. The seed's first line is a `skill_listing` with `verify`, `mattpocock-skills:grilling` and `anthropic-skills:xlsx`.

- **Journey.** `journeys/autocomplete.ts` covers `ac-skills`, `ac-builtin`, `ac-filter`, `ac-keys` and `ac-live`.
- **Key proof.** The journey records each `/api/keys` request of the page. With the popup open, there must be none. It also puts `pending` in the fixture's input box and checks that Esc with the popup open leaves it there.
- **Live proof.** The journey appends a delta `skill_listing` with `fresh-skill` to `$TRANSCRIPT` and waits for `/fresh-skill` in the popup.

## Gotchas

- The fixture is a Claude agent. Codex (`$` skills) has no fixture: report it as not verified, and name the unit tests in `transcripts.test.ts` and `completions.test.ts`.
- The fixture always starts with a transcript, so the "no transcript yet" state (built-in commands only) is not reachable. Report it as not verified.
- The fixture ignores Tab, so its screen cannot show that Tab did not arrive. Use the `/api/keys` requests.
- The fixture has no `blocked` state, so "popup keys do not answer a question" is not reachable.
