// Fixture agent: a stand-in for Claude Code that herdr and herdr-chat-view accept.
//   exec -a claude bun fixture-agent.ts <transcript.jsonl> <session-id>
//
// - herdr identifies the agent from the process argv[0], hence `exec -a claude`.
// - It reports its session ID with the claude integration source, as the real
//   SessionStart hook does. `agent list` then carries the session and the chat
//   finds the transcript.
// - The prompt box on screen (rule, "❯", rule) makes herdr's claude rules report idle.
// - Enter appends a user entry and an "echo: <text>" assistant entry to the transcript.
// - Typed text shows in the input box, so herdr-chat's draft handoff can read it.
// - Shift+Tab cycles the mode line. Esc clears the input box. Ctrl+C exits.
// - The message "context <n>" sets the footer chip to "<n>% context" (42 at the start).
import { appendFileSync } from "node:fs";

const [transcript, session] = process.argv.slice(2);
if (!transcript || !session) {
  console.error("usage: fixture-agent.ts <transcript.jsonl> <session-id>");
  process.exit(2);
}
const pane = process.env.HERDR_PANE_ID;
const herdr = process.env.HERDR_BIN_PATH || "herdr";

const seq = () => String(BigInt(Date.now()) * 1_000_000n);
if (pane) {
  Bun.spawnSync([herdr, "pane", "report-agent-session", "--source", "herdr:claude", "--agent", "claude",
    "--seq", seq(), "--agent-session-id", session,
    "--agent-session-path", transcript, "--session-start-source", "startup", pane]);
}

let n = 0;
const entry = (type: "user" | "assistant", text: string) => {
  n++;
  const line = { type, uuid: `${session}-live-${n}`, timestamp: new Date().toISOString(), message: { role: type, content: [{ type: "text", text }] } };
  appendFileSync(transcript, JSON.stringify(line) + "\n");
};

const MODES = ["", "⏵⏵ accept edits on (shift+tab to cycle)", "⏸ plan mode on (shift+tab to cycle)"];
let mode = 0;
let input = "";
let last = "(none)";
let context = 42;

const rule = "─".repeat(60);
function draw() {
  const box = input ? `❯ ${input}` : "❯ \x1b[2mType a message\x1b[0m";
  const footer = [MODES[mode], `fixture-agent · verify  \x1b[33m⎇ main\x1b[0m  ${context}% context`].filter(Boolean).join("\n  ");
  process.stdout.write(`\x1b]0;fixture-agent\x07\x1b[2J\x1b[Hfixture-agent session ${session}\nlast: ${last}\nmode: ${mode}\n\n${rule}\n${box}\n${rule}\n  ${footer}\n`);
}

function submit() {
  const text = input.trim();
  input = "";
  if (text) {
    entry("user", text);
    entry("assistant", `echo: ${text}`);
    last = text;
    const m = /^context (\d+)$/.exec(text);
    if (m) context = Number(m[1]);
  }
}

process.stdin.setRawMode?.(true);
draw();
for await (const chunk of Bun.stdin.stream()) {
  let s = new TextDecoder().decode(chunk).replace(/\x1b\[20[01]~/g, "");
  while (s) {
    if (s.startsWith("\x1b[Z")) { mode = (mode + 1) % MODES.length; s = s.slice(3); continue; }
    if (s.startsWith("\x1b[")) { s = s.replace(/^\x1b\[[0-9;]*[A-Za-z~]/, ""); continue; }
    const c = s[0];
    s = s.slice(1);
    if (c === "\x03") process.exit(0);
    else if (c === "\x1b") input = "";
    else if (c === "\r") submit();
    else if (c === "\x7f") input = input.slice(0, -1);
    else if (c === "\n") input += "\n";
    else if (c >= " ") input += c;
  }
  draw();
}
