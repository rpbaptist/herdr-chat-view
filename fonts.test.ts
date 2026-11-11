import { describe, expect, test } from "bun:test";
import { fontCss, parseFont } from "./fonts.ts";

const DEFAULT = parseFont({});
const vars = (css: string) => Object.fromEntries([...css.matchAll(/--([\w-]+): ([^;]+);/g)].map((m) => [m[1], m[2]]));

describe("parseFont", () => {
  test("gives the defaults for an empty table", () => {
    expect(DEFAULT).toEqual({ sans: null, mono: null, size: 15, monoSize: 13 });
  });

  test("reads the four keys", () => {
    expect(parseFont({ sans: "Inter, Arial", mono: "'Fira Code'", size: 16, mono_size: 12.5 }))
      .toEqual({ sans: ["Inter", "Arial"], mono: ["Fira Code"], size: 16, monoSize: 12.5 });
    expect(parseFont({ sans: "terminal" }).sans).toBe("terminal");
  });

  test("rejects an unknown key", () => {
    expect(() => parseFont({ serif: "x" })).toThrow("unknown key font.serif");
  });

  test.each([[7.9], [41], ["15"], [true], [NaN]])("rejects the size %p", (v) => {
    expect(() => parseFont({ size: v })).toThrow(/font\.size must be a number from 8 to 40/);
    expect(() => parseFont({ mono_size: v })).toThrow(/font\.mono_size must be a number/);
  });

  test.each([[""], ["a;b"], ['a"; } body { x: y'], ["a\nb"], ["url(x)"], ["a,,b"], [" , "], [5], ["x".repeat(201)]])("rejects the family %p", (v) => {
    expect(() => parseFont({ mono: v })).toThrow(/font\.mono/);
    expect(() => parseFont({ sans: v })).toThrow(/font\.sans/);
  });
});

describe("fontCss", () => {
  test("gives the default stacks and sizes with no config", () => {
    expect(vars(fontCss(DEFAULT))).toEqual({
      sans: '"Inter", "Geist", system-ui, -apple-system, "Segoe UI", sans-serif', mono: "monospace", fs: "15px", ms: "13px",
    });
  });

  test("a configured mono font ends with monospace", () => {
    expect(vars(fontCss(parseFont({ mono: "Fira Code" }))).mono).toBe('"Fira Code", monospace');
  });

  test("sans ends with sans-serif, and generic names stay unquoted", () => {
    expect(vars(fontCss(parseFont({ sans: "Lato, Serif" }))).sans).toBe('"Lato", serif, sans-serif');
    expect(vars(fontCss(parseFont({ sans: "Lato, sans-serif" }))).sans).toBe('"Lato", sans-serif');
  });

  test('sans = "terminal" uses the mono stack', () => {
    const v = vars(fontCss(parseFont({ sans: "terminal", mono: "JetBrainsMono Nerd Font" })));
    expect(v.sans).toBe(v.mono);
  });

  test("sizes", () => {
    const v = vars(fontCss(parseFont({ size: 17, mono_size: 11.5 })));
    expect([v.fs, v.ms]).toEqual(["17px", "11.5px"]);
  });

  test("a family value cannot add a declaration or a rule", () => {
    for (const bad of ['x"; } * { display: none', "x; y", "x}", "x\\"]) expect(() => parseFont({ mono: bad })).toThrow();
    const css = fontCss(parseFont({ sans: "a b", mono: "c_d.e+f-g" }));
    expect(css.match(/[{}]/g)).toHaveLength(2);
    expect(css.match(/;/g)).toHaveLength(4);
  });
});
