import { describe, expect, test } from "bun:test";
import { inputText } from "./screen.ts";

const rule = (n = 40) => "─".repeat(n);
const screen = (...lines: string[]) => lines.join("\n");

describe("inputText", () => {
  test("returns the text in the input box", () => {
    expect(inputText(screen("output", rule(), "❯ hello there", rule(), "  ? for shortcuts"))).toBe("hello there");
  });

  test("keeps line breaks between short lines", () => {
    expect(inputText(screen(rule(), "❯ first", "  second", rule()))).toBe("first\nsecond");
  });

  test("joins a line that the box wrapped at its width", () => {
    const wrapped = "❯ " + "a".repeat(38);
    expect(inputText(screen(rule(), wrapped, "  bbb", rule()))).toBe("a".repeat(38) + "bbb");
  });

  test("returns empty for the dim placeholder", () => {
    expect(inputText(screen(rule(), '❯ \x1b[2mTry "fix lint errors"\x1b[0m', rule()))).toBe("");
  });

  test("returns empty for a blank box", () => {
    expect(inputText(screen(rule(), "❯ ", rule()))).toBe("");
  });

  test("ignores ANSI colors and carriage returns", () => {
    expect(inputText(screen(`\x1b[38;5;8m${rule()}\x1b[0m\r`, "\x1b[1m❯\x1b[0m hi\r", rule()))).toBe("hi");
  });

  test("uses the last box on the screen", () => {
    expect(inputText(screen(rule(), "❯ old", rule(), "text", rule(), "❯ new", rule()))).toBe("new");
  });

  test("returns null when there is no input box", () => {
    expect(inputText("just some output")).toBeNull();
    expect(inputText(screen(rule(), "not a prompt", rule()))).toBeNull();
  });

  test("does not take a short line of dashes as a rule", () => {
    expect(inputText(screen("─────", "❯ x", "─────"))).toBeNull();
  });
});
