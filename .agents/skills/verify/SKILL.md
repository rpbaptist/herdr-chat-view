---
name: verify
description: Drive the real herdr-chat-view plugin end to end and capture proof. Starts an isolated headless herdr session with a fixture Claude agent, runs the real toggle action, and drives the chat page in headless Chromium. Use to prove a change to herdr-chat.ts, transcripts.ts or index.html works, before you report it done.
---

# Verify herdr-chat-view

The surface is the chat page (`index.html`) that the chat pane shows next to an agent pane. Its server is `herdr-chat.ts serve`, and the toggle action starts it. A verify run does these steps:

1. It starts a **named headless herdr session** (`verify-chat-<time>-<n>`). The user's live sessions stay untouched.
2. It starts a **fixture agent** in that session. The fixture is a small Bun program that herdr detects as `claude` and that writes a real Claude-format transcript. It uses no model and no tokens.
3. It runs the **real toggle action** from the checkout under test. This opens the chat pane (pixel) and starts the chat server.
4. It opens the **same URL** that the chat pane loads in headless Chromium (Playwright). It drives the page through its stable ids and observes side effects through herdr and the transcript.

Run the commands below from the repository root. The skill lives in `.agents/skills/verify/`. `.claude/skills/verify` is a symlink to it for Claude Code.

## Setup (one time per machine)

```bash
cd .agents/skills/verify && bun install        # playwright-core only; uses the system Chromium
```

The skill needs these on `PATH`: `herdr` (0.9.5 or later), `bun`, `jq`, `curl`, and `/usr/bin/chromium` (set `CHROMIUM=<path>` to use another one). The repository root must have `node_modules` with pixel installed. The first chat pane installs it.

## Launch

```bash
.agents/skills/verify/scripts/up.sh [checkout-dir]
```

- `checkout-dir` defaults to the repository that holds this skill. Give a worktree path to verify that worktree.
- Ready means that the last line is `READY <run-dir>`. At that point the fixture agent is `claude idle` with its session ID, the chat pane exists, and `/health` answers.
- `<run-dir>` is `~/.local/state/herdr-chat-verify/<run>/`. It holds `run.env`, which has the URL, token, pane IDs, socket, transcript and server PID. Read `run.env` to get these values. Do not guess them.
- If `up.sh` fails, it prints the `down.sh` command to run. Run that command before you try again.

To run herdr commands by hand against the instance, use the instance's socket. Unset `HERDR_PANE_ID`, so that no command targets your own live pane:

```bash
set -a; source <run-dir>/run.env; set +a; unset HERDR_PANE_ID
herdr agent get "$AGENT_PANE"
```

## Doctor

Run this first, and run it again when something looks wrong. It is read-only and exits 0 only if all checks pass.

```bash
.agents/skills/verify/scripts/doctor.sh <run-dir>
```

It checks these items: the session answers; the agent pane is `claude` with this run's session ID; the chat pane exists; the transcript exists; the server PID runs `<checkout>/herdr-chat.ts serve`; the state directory belongs to this run; `/health` answers; and the served page is byte-equal to `<checkout>/index.html`. The last check finds a stale server that runs old code.

## Drive

```bash
bun .agents/skills/verify/scripts/page.ts <run-dir> <journey.ts> [args...]
```

A journey is a TypeScript file that exports `default async (j: Journey) => {}`. Throw an error to fail the journey. `page.ts` opens `URL` and then calls the journey with these helpers:

- `j.page` is the Playwright page.
- `j.shot(name)` saves a numbered screenshot.
- `j.step(msg)` writes to `steps.log`.
- `j.herdr(...args)` runs a herdr command against this session.
- `j.agentScreen()` returns the visible text of the fixture pane.
- `j.transcript()` returns the parsed transcript lines.
- `j.until(what, fn)` polls until `fn` returns a true value.

Use these page handles: `#input` (composer), `#send`, `#stop`, `#mode` (mode pill, `.ml` holds the label), `#term` (the "Terminal" button), `#items .msg.user`, `#items .msg.assistant`, `#items .msg.note`, `#items details.steps` (tool-call group), `#status .seg` (footer segments), `#blocked` (`.on` when the agent asks a question), `#hchip` (agent status text), `#err` (error line).

The fixture agent (`scripts/fixture-agent.ts`) does these things:

- It shows a Claude-style input box. When the box is empty, it shows a dim placeholder.
- It echoes each submitted line as `echo: <text>` into the transcript.
- On its screen it shows `last: <text>` and `mode: <n>`.
- Shift+Tab cycles the mode line: none, then `accept edits on`, then `plan mode on`.
- Esc clears the input box.

The shipped journeys are in `journeys/`. Each feature file in `features/` lists its recipe and its proof. Start at [features/README.md](features/README.md).

## Evidence

Each journey writes its evidence to `<run-dir>/<journey-name>/`: numbered PNGs, `steps.log` and `console.log`. If a journey fails, it also saves a `NN-failure.png`. `down.sh` copies `transcript.jsonl` and `server.log` into `<run-dir>`. Cleanup keeps all of this evidence.

Proof standards:

- Drive the page the way a user does: type, click and press keys. Do not call `/api/*` with curl to prove a feature that has a page control.
- Capture the state before and after an action, not only the last screen.
- Check side effects outside the page. For example, check the transcript entry (`j.transcript()`), the agent pane (`j.agentScreen()`), and the herdr pane layout and zoom (`herdr pane layout --pane $AGENT_PANE`).
- Look at the screenshots before you report. A journey can pass and still show a broken layout.
- The fixture stands in for Claude Code. It does not prove that real Claude transcripts parse. For a parser change, add the real line shape to a fixture or seed, and name that limit in the report.

## Cleanup

```bash
.agents/skills/verify/scripts/down.sh <run-dir>
```

The script stops only what `up.sh` started:

- It kills the chat server by its recorded PID, after it checks the command line of that PID.
- It stops and deletes the named herdr session. The fixture agent and the pixel processes of the chat pane stop with the session.
- It removes the state directory under `$XDG_RUNTIME_DIR/herdr-chat/` and the fixture transcript under `~/.claude/projects/-herdr-chat-verify-<run>/`.

It keeps `<run-dir>`. Do not kill processes by name: `pixel`, `bun` and `herdr-chat.ts serve` also run for the user's live chat panes. Never run `herdr server stop` and never stop a session that does not start with `verify-chat-`.

## Isolation and gotchas

- **Parallel runs.** Each run has its own herdr session, socket, state directory, server port and transcript, so two runs can go at the same time.
- **Shared things.** These are shared with the user:
  - The global herdr config and plugins. Other plugins (auto-title, radar, bar) also run in the verify session and can rename panes. Do not assert on pane labels.
  - Pixel's profile at `~/.config/herdr-chat-view`.
- **Linked plugin.** The chat pane runs `chat-pane.sh` from the herdr-linked plugin root (`herdr plugin list`), not always from the checkout under test. The server and `index.html` come from the checkout, because `up.sh` runs `<checkout>/herdr-chat.ts toggle`. Headless Chromium drives the page and not pixel, so this difference does not matter for page journeys. It matters only for a change to `chat-pane.sh` or `chat-view.cjs`. Those two files are not covered here.
- **Agent detection.** herdr identifies the agent from `argv[0]`, so the fixture runs with `exec -a claude`. It sets the session ID with `pane report-agent-session --source herdr:claude`. Another source does not set it.
- **Detection delay.** The idle state comes from the screen, so it takes 1–3 s after a redraw.
- **Hard-coded transcript path.** `transcripts.ts` reads Claude transcripts from `~/.claude/projects` only. It ignores `CLAUDE_CONFIG_DIR`. The fixture writes there for this reason.
- **No blocked or working state.** The fixture cannot enter `working` or `blocked`. Journeys that need these states (the blocked answer panel, the stop button, the "Working…" indicator) must report that the precondition is missing. Alternatively, extend the fixture. Do not weaken the journey.
- **Expected console line.** `console.log` always has one line `Failed to load resource ... 403`. It is the browser's `/favicon.ico` request, which has no token. Ignore this line. Report any other line.
- **Server idle exit.** The server exits after 10 minutes with no open page. If a run idles longer, run `doctor.sh`. It shows `/health` FAIL. Then run `down.sh` and `up.sh` again.
