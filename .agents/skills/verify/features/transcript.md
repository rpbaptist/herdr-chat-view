# Transcript view

The chat shows the agent's own transcript: user and assistant messages, markdown, tool calls grouped in collapsible "steps" with a count of failures, and slash commands. It hides meta lines. New transcript lines show without a reload.

## Sub-features

- `tx-messages` shows user bubbles and assistant text in order.
- `tx-markdown` shows bold text, inline code and lists in assistant text.
- `tx-steps` shows a run of tool calls as one `details.steps` group, for example "2 steps · 1 failed".
- `tx-hidden` hides `isMeta` and sidechain lines.
- `tx-command` shows `<command-name>` input as `/name args`.
- `tx-live` adds a line that is appended to the transcript, without a reload.
- `tx-reset` resets the chat when the agent pane starts a new session ID.

## How to get to it (user POV)

- Open the chat view (toggle) on a pane that runs Claude Code or Codex.

## Driving it with page.ts

Preconditions:

- Baseline state. The seed is `fixtures/seed.jsonl`.

- **Seeded items.** Wait for `#items .msg.user` with `Fixture question: list the files`. Expect these items: `.msg.assistant` that contains `strong` "list" and `code` "ls"; one `details.steps` with summary text that contains `2 steps` and `1 failed`; `.msg.assistant` with `Fixture answer`; and `.msg.user` with `/fixture-command arg1`.
- **Hidden lines.** Expect no element with the text `Fixture meta line`.
- **Expand steps.** Click `details.steps > summary`. Two `details.step` items show, and one of them has class `err`.
- **Live append.** Append a Claude-format line to `run.TRANSCRIPT` (shape as in `fixtures/seed.jsonl`) with unique text. Within 2 s, a matching `.msg` shows without a reload.
- **Proof.** Take a screenshot before and after you expand the steps and after the live append. Also save `page.locator("#items").innerHTML()` to the evidence directory.

## Gotchas

- The server reads only complete lines (up to the last `\n`). An append without a trailing new line does not show.
- The server finds Claude transcripts only under `~/.claude/projects`. A real session that runs with `CLAUDE_CONFIG_DIR` set elsewhere shows "New session".
- For `tx-reset`, the new session needs a new transcript file and a new `report-agent-session` call with source `herdr:claude`. Otherwise the server keeps the old session.
- A parser change for Codex needs a Codex-format fixture and an agent with `argv[0]` `codex`. The current fixture covers Claude only.
