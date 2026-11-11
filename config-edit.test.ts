import { describe, expect, test } from "bun:test";
import { setKey } from "./config-edit.ts";

describe("setKey", () => {
  test("makes the file and the table", () => {
    expect(setKey("", "theme", "mode", "dark")).toBe('[theme]\nmode = "dark"\n');
  });

  test("adds a table at the end with a blank line before it", () => {
    expect(setKey("[a]\nx = 1\n", "b", "y", 2)).toBe("[a]\nx = 1\n\n[b]\ny = 2\n");
    expect(setKey("[a]\nx = 1\n\n", "b", "y", 2)).toBe("[a]\nx = 1\n\n[b]\ny = 2\n");
    expect(setKey("[a]\nx = 1", "b", "y", 2)).toBe("[a]\nx = 1\n\n[b]\ny = 2\n");
  });

  test("adds a key after the last key of its table, before the next table and its comment", () => {
    const text = "[a]\nx = 1\n# about b\n[b]\ny = 2\n";
    expect(setKey(text, "a", "z", true)).toBe("[a]\nx = 1\nz = true\n# about b\n[b]\ny = 2\n");
  });

  test("adds a key to an empty table", () => {
    expect(setKey("[a] # note\n[b]\ny = 2\n", "a", "z", 1.5)).toBe("[a] # note\nz = 1.5\n[b]\ny = 2\n");
  });

  test("replaces a value and keeps the indent and the comment", () => {
    expect(setKey('# top\n[a]\n  x = "old"   # why\ny = 2\n', "a", "x", "new")).toBe('# top\n[a]\n  x = "new" # why\ny = 2\n');
  });

  test("replaces a value in its own table only", () => {
    expect(setKey("[a]\nx = 1\n[b]\nx = 2\n", "b", "x", 3)).toBe("[a]\nx = 1\n[b]\nx = 3\n");
  });

  test("replaces an array that spans lines", () => {
    const text = '[status]\nhide = [\n  "a", # one\n  "]",\n]\nmode = true # keep\n[b]\nx = 1\n';
    expect(setKey(text, "status", "hide", ["x", "y"])).toBe('[status]\nhide = ["x", "y"]\nmode = true # keep\n[b]\nx = 1\n');
  });

  test("replaces a multi-line string", () => {
    expect(setKey('[a]\nx = """\n[b]\n"""\ny = 1\n', "a", "x", "s")).toBe('[a]\nx = "s"\ny = 1\n');
  });

  test("does not read a header inside a multi-line array or string", () => {
    expect(setKey('[a]\nx = [\n  "[b]",\n]\n', "b", "y", 1)).toBe('[a]\nx = [\n  "[b]",\n]\n\n[b]\ny = 1\n');
  });

  test("matches a header with spaces and a quoted key", () => {
    expect(setKey('[ a ]\n"x" = 1\n', "a", "x", 2)).toBe('[ a ]\nx = 2\n');
  });

  test("ignores a commented key, an array of tables and a dotted table", () => {
    expect(setKey("[a]\n# x = 1\n", "a", "x", 2)).toBe("[a]\nx = 2\n# x = 1\n");
    expect(setKey("[[a]]\nx = 1\n[a.b]\nx = 1\n", "a", "x", 2)).toBe("[[a]]\nx = 1\n[a.b]\nx = 1\n\n[a]\nx = 2\n");
  });

  test("keeps CRLF line endings", () => {
    expect(setKey("[a]\r\nx = 1\r\n", "a", "y", 2)).toBe("[a]\r\nx = 1\r\ny = 2\r\n");
  });

  test("writes strings, booleans, numbers and lists as TOML that parses back", () => {
    const value = ['a"b', "c\\d", "é", "line\nbreak", "\x7f"];
    const out = Bun.TOML.parse(setKey("", "t", "k", value)) as any;
    expect(out.t.k).toEqual(value);
    expect((Bun.TOML.parse(setKey("", "t", "k", "q\"\n\\")) as any).t.k).toBe('q"\n\\');
    expect((Bun.TOML.parse(setKey("", "t", "k", false)) as any).t.k).toBe(false);
    expect((Bun.TOML.parse(setKey("", "t", "k", -3)) as any).t.k).toBe(-3);
    expect((Bun.TOML.parse(setKey("", "t", "k", [])) as any).t.k).toEqual([]);
  });

  test("refuses bad names and numbers", () => {
    expect(() => setKey("", "a]\n[b", "k", 1)).toThrow();
    expect(() => setKey("", "a", "k = 1\nj", 1)).toThrow();
    expect(() => setKey("", "a", "k", NaN)).toThrow();
    expect(() => setKey("", "a", "k", null as never)).toThrow(/list of strings/);
    expect(() => setKey("", "a", "k", [1] as never)).toThrow(/list of strings/);
  });
});
