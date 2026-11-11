import { describe, expect, test } from "bun:test";
import { completions } from "./completions.ts";

describe("completions", () => {
  test("claude: skills and built-in commands share the / trigger", () => {
    const list = completions("claude", [{ name: "verify", description: "Prove it." }]);
    expect(list).toContainEqual({ name: "verify", description: "Prove it.", trigger: "/", source: "skill" });
    expect(list).toContainEqual(expect.objectContaining({ name: "compact", trigger: "/", source: "builtin" }));
  });

  test("codex: skills use $, built-in commands use /", () => {
    const list = completions("codex", [{ name: "imagegen", description: "Images." }]);
    expect(list).toContainEqual({ name: "imagegen", description: "Images.", trigger: "$", source: "skill" });
    expect(list).toContainEqual(expect.objectContaining({ name: "model", trigger: "/", source: "builtin" }));
    expect(list.filter((c) => c.trigger === "$").map((c) => c.name)).toEqual(["imagegen"]);
  });

  test("without skills, only the built-in commands", () => {
    const list = completions("claude", []);
    expect(list.length).toBeGreaterThan(10);
    expect(list.every((c) => c.source === "builtin")).toBe(true);
  });

  test("de-duplicates by name; a skill replaces a built-in command of the same name", () => {
    const list = completions("claude", [
      { name: "review", description: "My review." },
      { name: "verify", description: "" },
      { name: "verify", description: "Prove it." },
    ]);
    expect(list.filter((c) => c.name === "review")).toEqual([{ name: "review", description: "My review.", trigger: "/", source: "skill" }]);
    expect(list.filter((c) => c.name === "verify")).toEqual([{ name: "verify", description: "Prove it.", trigger: "/", source: "skill" }]);
  });

  test("an unknown agent kind has no completions", () => {
    expect(completions("gemini", [{ name: "x", description: "" }])).toEqual([]);
    expect(completions(null, [])).toEqual([]);
  });
});
