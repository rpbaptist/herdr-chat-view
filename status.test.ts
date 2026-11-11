import { describe, expect, test } from "bun:test";
import { statusBar, type StatusAgent } from "./status.ts";

const rule = (n = 40) => "─".repeat(n);
const screen = (...lines: string[]) => lines.join("\n");
const agent: StatusAgent = { agent: "claude", agent_status: "idle", cwd: "/home/me/code/app" };
const HOME = "/home/me";
const bar = (s: string, config: string | null = null, a: StatusAgent | null = agent) => statusBar(s, a, config, HOME);
const texts = (s: string, config: string | null = null, a: StatusAgent | null = agent) => bar(s, config, a).chips.map((c) => c.text);

const claude = screen(
  "❯ hi",
  rule(),
  "  \x1b[38;5;141m⏵⏵ accept edits on\x1b[39m (shift+tab to cycle) · 2 files",
  "  \x1b[2mOpus 4.7\x1b[0m  \x1b[33m⎇ main\x1b[0m  42% context",
);

describe("statusBar without config", () => {
  test("shows the mode pill and the screen chips in the agent's order", () => {
    const b = bar(claude);
    expect(b.mode).toEqual({ label: "Accept edits", extra: "2 files", color: 141 });
    expect(b.chips).toEqual([
      { type: "screen", ansi: "\x1b[2mOpus 4.7", text: "Opus 4.7" },
      { type: "screen", ansi: "\x1b[33m⎇ main\x1b[0m", text: "⎇ main" },
      { type: "screen", ansi: "42% context", text: "42% context" },
    ]);
    expect(b.error).toBeNull();
  });

  test("splits chips at spaces between color codes", () => {
    expect(texts(screen(rule(), "\x1b[2mone\x1b[0m \x1b[33mtwo three\x1b[0m"))).toEqual(["one", "two three"]);
  });

  test("has no mode pill when the footer has no mode line", () => {
    expect(bar(screen(rule(), "  model: opus")).mode).toBeNull();
  });

  test("uses a basic color code for the mode pill", () => {
    expect(bar(screen(rule(), "\x1b[93m⏸ plan mode on\x1b[0m")).mode).toEqual({ label: "Plan mode", extra: "", color: 11 });
  });

  test("has no chips when the screen has no rule", () => {
    expect(bar("plain output")).toEqual({ mode: null, chips: [], error: null });
  });

  test("reads at most four footer lines", () => {
    expect(texts(screen(rule(), "1", "2", "3", "4", "5"))).toEqual(["1", "2", "3", "4"]);
  });
});

describe("statusBar config", () => {
  test("hides the mode pill with mode = false", () => {
    expect(bar(claude, "[status]\nmode = false").mode).toBeNull();
  });

  test("keeps the mode pill when the config leaves out mode", () => {
    expect(bar(claude, "[status]\nitems = [\"*\"]").mode?.label).toBe("Accept edits");
  });

  test("hides chips that match a regex on the plain text", () => {
    expect(texts(claude, '[status]\nhide = ["/\\\\d+% context/"]')).toEqual(["Opus 4.7", "⎇ main"]);
  });

  test("matches without case with the i flag", () => {
    expect(texts(claude, '[status]\nhide = ["/OPUS/i"]')).toEqual(["⎇ main", "42% context"]);
  });

  test("puts matching chips first, then the remaining chips with *", () => {
    expect(texts(claude, '[status]\nitems = ["/context/", "/^⎇/", "*"]')).toEqual(["42% context", "⎇ main", "Opus 4.7"]);
  });

  test("shows only the listed items without *", () => {
    expect(texts(claude, '[status]\nitems = ["/^⎇/"]')).toEqual(["⎇ main"]);
  });

  test("shows a chip only once when two regexes match it", () => {
    expect(texts(claude, '[status]\nitems = ["/main/", "/⎇/", "*"]')).toEqual(["⎇ main", "Opus 4.7", "42% context"]);
  });

  test("keeps a hidden chip hidden when a regex in items or * matches it", () => {
    expect(texts(claude, '[status]\nhide = ["/main/"]\nitems = ["/⎇/", "*"]')).toEqual(["Opus 4.7", "42% context"]);
  });

  test("ignores a regex that matches no chip, so one config works for each agent kind", () => {
    const codex = screen(rule(), "  gpt-5  ~/code/app");
    expect(texts(codex, '[status]\nitems = ["/^⎇/", "*"]')).toEqual(["gpt-5", "~/code/app"]);
  });
});

describe("statusBar built-in items", () => {
  const items = (list: string) => `[status]\nitems = [${list}]`;

  test("shows the agent kind, cwd and status where items lists them", () => {
    expect(bar(claude, items('"kind", "/^⎇/", "cwd", "status"')).chips).toEqual([
      { type: "builtin", name: "kind", text: "claude" },
      { type: "screen", ansi: "\x1b[33m⎇ main\x1b[0m", text: "⎇ main" },
      { type: "builtin", name: "cwd", text: "~/code/app" },
      { type: "builtin", name: "status", text: "idle" },
    ]);
  });

  test("uses the foreground cwd before the cwd", () => {
    expect(texts(claude, items('"cwd"'), { ...agent, foreground_cwd: "/srv/data" })).toEqual(["/srv/data"]);
  });

  test("shows ~ for the home directory itself", () => {
    expect(texts(claude, items('"cwd"'), { ...agent, cwd: HOME })).toEqual(["~"]);
  });

  test("does not take a sibling of the home directory as home", () => {
    expect(texts(claude, items('"cwd"'), { ...agent, cwd: "/home/meg/app" })).toEqual(["/home/meg/app"]);
  });

  test("leaves out built-in items when there is no agent", () => {
    expect(texts(claude, items('"kind", "status", "cwd"'), null)).toEqual([]);
  });

  test("shows no built-in item without config", () => {
    expect(bar(claude).chips.every((c) => c.type === "screen")).toBe(true);
  });
});

describe("statusBar config errors", () => {
  const defaults = bar(claude);
  const expectDefaults = (config: string, message: RegExp) => {
    const b = bar(claude, config);
    expect(b.error).toMatch(message);
    expect(b.error).not.toContain("\n");
    expect({ ...b, error: null }).toEqual(defaults);
  };

  test("falls back to the defaults on a TOML syntax error", () => {
    expectDefaults('[status]\nmode = fals\nhide = ["/main/"]', /^config\.toml: /);
  });

  test("falls back to the defaults on a regex that is not valid", () => {
    expectDefaults('[status]\nmode = false\nhide = ["/(oops/"]', /status\.hide\[0\]/);
  });

  test("falls back to the defaults on an unknown built-in name", () => {
    expectDefaults('[status]\nitems = ["/^⎇/", "brnch"]', /status\.items\[1\]: unknown item "brnch"/);
  });

  test("falls back to the defaults on a wrong value type", () => {
    expectDefaults('[status]\nmode = "no"', /status\.mode/);
    expectDefaults("[status]\nhide = \"/x/\"", /status\.hide/);
  });

  test("falls back to the defaults on an unknown key", () => {
    expectDefaults("[status]\nhidden = []", /unknown key status\.hidden/);
  });

  test("falls back to the defaults on a key outside [status]", () => {
    expectDefaults("mode = false", /unknown key mode .*\[status\]/);
  });

  test("clears the error when the config is correct again", () => {
    expect(bar(claude, '[status]\nitems = ["brnch"]').error).not.toBeNull();
    expect(bar(claude, '[status]\nitems = ["kind"]')).toEqual({ mode: defaults.mode, chips: [{ type: "builtin", name: "kind", text: "claude" }], error: null });
  });
});
