import { expect, test } from "bun:test";
import { parseReplies } from "./terminal-colors.ts";

test("reads the OSC 10, 11 and 4 replies, with ST or BEL", () => {
  const text = "\x1b]10;rgb:ebeb/dbdb/b2b2\x1b\\\x1b]11;rgb:1d1d/2020/2121\x07\x1b]4;1;rgb:cccc/2424/1d1d\x1b\\\x1b]4;15;#EBDBB2\x1b\\\x1b[?62;22c";
  const c = parseReplies(text);
  expect([c.fg, c.bg, c.ansi[1], c.ansi[15]]).toEqual(["#ebdbb2", "#1d2021", "#cc241d", "#ebdbb2"]);
  expect(c.ansi.filter(Boolean)).toHaveLength(2);
});

test("scales 1 to 4 hex digits for each channel", () => {
  expect(parseReplies("\x1b]11;rgb:f/8/0\x1b\\").bg).toBe("#ff8800");
  expect(parseReplies("\x1b]11;rgb:ff/80/00\x1b\\").bg).toBe("#ff8000");
  expect(parseReplies("\x1b]11;rgb:fff/800/000\x1b\\").bg).toBe("#ff8000");
});

test("leaves out a color with no reply, a bad value, or an index over 15", () => {
  const c = parseReplies("\x1b]10;bogus\x1b\\\x1b]4;200;rgb:ff/ff/ff\x1b\\");
  expect(c).toEqual({ fg: null, bg: null, ansi: Array(16).fill(null) });
});
