import { describe, expect, test } from "bun:test";
import { agents } from "./agents.ts";

const claude = agents.claude.parse;
const codex = agents.codex.parse;

describe("claude parser", () => {
  const user = (content: unknown, extra = {}) => ({ type: "user", uuid: "u1", timestamp: "T", message: { content }, ...extra });
  const assistant = (content: unknown) => ({ type: "assistant", uuid: "a1", timestamp: "T", message: { content } });

  test("parses a user message with string content", () => {
    expect(claude(user("hello"), 0)).toEqual([{ kind: "user", id: "u1:0", text: "hello", ts: "T" }]);
  });

  test("parses assistant text and tool calls", () => {
    const items = claude(assistant([
      { type: "text", text: "Listing." },
      { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls -1", description: "List files" } },
    ]), 0);
    expect(items).toEqual([
      { kind: "assistant", id: "a1:0", text: "Listing.", ts: "T" },
      { kind: "tool_call", id: "toolu_1", name: "Bash", input: "ls -1", ts: "T" },
    ]);
  });

  test("skips blank assistant text", () => {
    expect(claude(assistant([{ type: "text", text: "  \n" }]), 0)).toEqual([]);
  });

  test("parses tool results and their error flag", () => {
    const items = claude(user([
      { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "a" }, { type: "image" }], is_error: true },
    ]), 0);
    expect(items).toEqual([{ kind: "tool_result", id: "toolu_1", output: "a\n[image]", error: true, ts: "T" }]);
  });

  test("clips long tool output", () => {
    const [item] = claude(user([{ type: "tool_result", tool_use_id: "t", content: "x".repeat(5000) }]), 0);
    expect(item.kind === "tool_result" && item.output).toBe("x".repeat(4000) + "\n…");
  });

  test("uses the first known input field, else JSON", () => {
    const call = (input: unknown) => claude(assistant([{ type: "tool_use", id: "t", name: "X", input }]), 0)[0];
    expect(call({ file_path: "/a", other: 1 })).toMatchObject({ input: "/a" });
    expect(call({ a: 1 })).toMatchObject({ input: '{"a":1}' });
    expect(call(undefined)).toMatchObject({ input: "" });
  });

  test("skips sidechain, meta and other line types", () => {
    expect(claude(user("x", { isSidechain: true }), 0)).toEqual([]);
    expect(claude(user("x", { isMeta: true }), 0)).toEqual([]);
    expect(claude({ type: "summary", summary: "x" }, 0)).toEqual([]);
  });

  test("shows a slash command with its arguments", () => {
    const text = "<command-name>/model</command-name><command-message>model</command-message><command-args>opus</command-args>";
    expect(claude(user(text), 0)).toMatchObject([{ kind: "user", text: "/model opus" }]);
  });

  test("shows shell input and its output", () => {
    expect(claude(user("<bash-input>ls</bash-input>"), 0)).toMatchObject([{ kind: "user", text: "! ls" }]);
    expect(claude(user("<bash-stdout>out</bash-stdout><bash-stderr>err</bash-stderr>"), 0))
      .toMatchObject([{ kind: "note", text: "out\nerr" }]);
    expect(claude(user("<local-command-stdout></local-command-stdout>"), 0)).toEqual([]);
  });

  test("hides other tagged user text", () => {
    expect(claude(user("<system-reminder>x</system-reminder>"), 0)).toEqual([]);
  });

  test("shows an interrupt as a note", () => {
    expect(claude(user("[Request interrupted by user]"), 0)).toMatchObject([{ kind: "note" }]);
  });

  test("shows a user image as a placeholder", () => {
    expect(claude(user([{ type: "image", source: {} }]), 0)).toMatchObject([{ kind: "user", text: "[image]" }]);
  });

  test("falls back to the sequence number when there is no uuid", () => {
    expect(claude({ type: "user", message: { content: "hi" } }, 7)).toMatchObject([{ id: "c7:0" }]);
  });
});

describe("codex parser", () => {
  const item = (payload: object) => ({ type: "response_item", timestamp: "T", payload });

  test("parses user and assistant messages", () => {
    expect(codex(item({ type: "message", role: "assistant", id: "m1", content: [{ text: "hi" }, { text: "there" }] }), 3))
      .toEqual([{ kind: "assistant", id: "m1:3", text: "hi\nthere", ts: "T" }]);
  });

  test("hides injected AGENTS.md and environment context", () => {
    const content = [{ text: "# AGENTS.md instructions" }, { text: "<environment_context>x</environment_context>" }];
    expect(codex(item({ type: "message", role: "user", content }), 0)).toEqual([]);
    expect(codex(item({ type: "message", role: "user", content: [...content, { text: "real" }] }), 0))
      .toMatchObject([{ kind: "user", text: "real" }]);
  });

  test("skips developer and system messages", () => {
    expect(codex(item({ type: "message", role: "developer", content: [{ text: "x" }] }), 0)).toEqual([]);
  });

  test("parses a function call with JSON arguments", () => {
    expect(codex(item({ type: "function_call", call_id: "c1", name: "shell", arguments: '{"command":"ls"}' }), 0))
      .toEqual([{ kind: "tool_call", id: "c1", name: "shell", input: "ls", ts: "T" }]);
  });

  test("keeps arguments that are not JSON", () => {
    expect(codex(item({ type: "custom_tool_call", call_id: "c1", name: "apply_patch", input: "*** Begin Patch" }), 0))
      .toMatchObject([{ input: "*** Begin Patch" }]);
  });

  test("parses function call output", () => {
    expect(codex(item({ type: "function_call_output", call_id: "c1", output: "done" }), 0))
      .toEqual([{ kind: "tool_result", id: "c1", output: "done", error: false, ts: "T" }]);
    expect(codex(item({ type: "function_call_output", call_id: "c1", output: { content: [{ text: "ok" }] } }), 0))
      .toMatchObject([{ output: "ok" }]);
  });

  test("skips other line types", () => {
    expect(codex({ type: "event_msg", payload: { type: "message" } }, 0)).toEqual([]);
    expect(codex(item({ type: "reasoning" }), 0)).toEqual([]);
  });
});

describe("claude skill parser", () => {
  const user = (content: string) => ({ type: "user", uuid: "u1", message: { content } });
  const listing = (names: string[], content: string, isInitial = true) =>
    ({ type: "attachment", uuid: "s1", attachment: { type: "skill_listing", isInitial, names, skillCount: names.length, content } });

  test("reads names and their descriptions", () => {
    const line = listing(
      ["verify", "mattpocock-skills:grilling", "anthropic-skills:xlsx"],
      "- verify: Drive the real plugin end to end.\n- mattpocock-skills:grilling: Grill the user: hard.\n- anthropic-skills:xlsx",
    );
    expect(agents.claude.parseSkills([line])).toEqual([
      { name: "verify", description: "Drive the real plugin end to end." },
      { name: "mattpocock-skills:grilling", description: "Grill the user: hard." },
      { name: "anthropic-skills:xlsx", description: "" },
    ]);
  });

  test("reads a later delta listing", () => {
    const delta = listing(["weighted-decisions"], "- weighted-decisions: Rank documented decisions.", false);
    expect(agents.claude.parseSkills([user("hi"), delta])).toEqual([{ name: "weighted-decisions", description: "Rank documented decisions." }]);
  });

  test("ignores other lines and sidechains", () => {
    expect(agents.claude.parseSkills([user("/verify"), { type: "attachment", attachment: { type: "todo" } }])).toEqual([]);
    expect(agents.claude.parseSkills([{ ...listing(["x"], "- x: y"), isSidechain: true }])).toEqual([]);
  });
});

describe("codex skill parser", () => {
  const developer = (text: string) =>
    ({ type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text }] } });
  const section = [
    "## Skills",
    "Skills are listed in \"### Available skills\" below.",
    "### Skill roots",
    "- `r1` = `/home/u/.codex/skills`",
    "### Available skills",
    "- imagegen: Generate or edit raster images (file: r2/imagegen/SKILL.md)",
    "- docs-tools:reconcile-docs: Reconcile docs: rank them (file: r1/reconcile-docs/SKILL.md)",
    "- bare (file: r1/bare/SKILL.md)",
    "### How to use skills",
    "- not: a skill",
  ].join("\n");

  test("reads the available skills section and drops the file part", () => {
    expect(agents.codex.parseSkills([developer(section)])).toEqual([
      { name: "imagegen", description: "Generate or edit raster images" },
      { name: "docs-tools:reconcile-docs", description: "Reconcile docs: rank them" },
      { name: "bare", description: "" },
    ]);
  });

  test("allows a blank line after the heading", () => {
    expect(agents.codex.parseSkills([developer("### Available skills\n\n- imagegen: Images (file: r2/x)\n\n- not: listed")]))
      .toEqual([{ name: "imagegen", description: "Images" }]);
  });

  test("ignores messages without the section and other line types", () => {
    expect(agents.codex.parseSkills([developer("# AGENTS.md\n- a: b"), { type: "world_state", payload: {} }])).toEqual([]);
  });
});
