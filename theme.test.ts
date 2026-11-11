import { describe, expect, test } from "bun:test";
import { THEMES } from "./herdr-themes.ts";
import { herdrPalette, parseTheme, themeStyle } from "./theme.ts";
import type { TerminalColors } from "./terminal-colors.ts";

const ansi = Array.from({ length: 16 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`);
const darkTerm: TerminalColors = { fg: "#ebdbb2", bg: "#1d2021", ansi };
const lightTerm: TerminalColors = { fg: "#282828", bg: "#f9f5d7", ansi };
const vars = (css: string) => Object.fromEntries([...css.matchAll(/--([\w-]+): ([^;]+);/g)].map((m) => [m[1], m[2]]));

describe("herdrPalette", () => {
  test("is catppuccin with no herdr config, as in herdr", () => {
    expect(herdrPalette(null, "auto", null)).toEqual(THEMES.catppuccin);
    expect(herdrPalette("not toml [", "auto", null)).toEqual(THEMES.catppuccin);
  });

  test("auto is [theme] name, and takes herdr's aliases", () => {
    expect(herdrPalette('[theme]\nname = "gruvbox"', "auto", null)).toEqual(THEMES.gruvbox);
    expect(herdrPalette('[theme]\nname = "Tokyo Night"', "auto", null)).toEqual(THEMES["tokyo-night"]);
  });

  test("auto with auto_switch follows the terminal background", () => {
    const cfg = '[theme]\nname = "gruvbox"\nauto_switch = true';
    expect(herdrPalette(cfg, "auto", lightTerm.bg)).toEqual(THEMES["gruvbox-light"]);
    expect(herdrPalette(cfg, "auto", darkTerm.bg)).toEqual(THEMES.gruvbox);
    expect(herdrPalette(cfg, "auto", null)).toEqual(THEMES.gruvbox);
  });

  test("dark and light are dark_name and light_name, else the siblings of name", () => {
    expect(herdrPalette('[theme]\nname = "gruvbox"', "light", null)).toEqual(THEMES["gruvbox-light"]);
    expect(herdrPalette('[theme]\nname = "gruvbox-light"', "dark", null)).toEqual(THEMES.gruvbox);
    expect(herdrPalette('[theme]\nname = "gruvbox"\nlight_name = "rose-pine-dawn"', "light", null)).toEqual(THEMES["rose-pine-dawn"]);
  });

  test("an unknown name falls back to catppuccin, or catppuccin-latte for light", () => {
    expect(herdrPalette('[theme]\nname = "nope"', "auto", null)).toEqual(THEMES.catppuccin);
    expect(herdrPalette('[theme]\nlight_name = "nope"', "light", null)).toEqual(THEMES["catppuccin-latte"]);
  });

  test("[theme.custom] overrides slots, and the mode table goes last", () => {
    const cfg = '[theme]\nname = "nord"\n[theme.custom]\naccent = "#f5c2e7"\nred = "LightRed"\ntext = "reset"\n[theme.custom.light]\naccent = "rgb(1, 2, 3)"';
    const auto = herdrPalette(cfg, "auto", null);
    expect([auto.accent, auto.red, auto.text, auto.green]).toEqual(["#f5c2e7", 9, null, THEMES.nord.green]);
    expect(herdrPalette(cfg, "light", null).accent).toBe("#010203");
  });

  test("a custom value that herdr does not know is cyan", () => {
    expect(herdrPalette('[theme.custom]\naccent = "chartreuse"', "auto", null).accent).toBe(6);
  });

  test("[ui] accent applies when [theme.custom] has no accent", () => {
    expect(herdrPalette('[ui]\naccent = "#123"', "auto", null).accent).toBe("#112233");
    expect(herdrPalette('[ui]\naccent = "cyan"', "auto", null).accent).toBe(THEMES.catppuccin.accent);
    expect(herdrPalette('[ui]\naccent = "#123"\n[theme.custom]\naccent = "#456"', "auto", null).accent).toBe("#445566");
  });
});

describe("themeStyle", () => {
  test("takes the herdr colors first", () => {
    const v = vars(themeStyle("auto", '[theme]\nname = "gruvbox"', darkTerm));
    const g = THEMES.gruvbox;
    expect(v).toMatchObject({
      bg: g.panel_bg, fg: g.text, muted: g.overlay0, accent: g.accent, ok: g.green, warn: g.yellow, err: g.red,
      "sel-bg": g.selection_bg, working: g.yellow, blocked: g.red, done: g.blue, idle: g.green,
    });
  });

  test("takes the ANSI colors from the terminal only", () => {
    const v = vars(themeStyle("auto", null, darkTerm));
    for (let i = 0; i < 16; i++) expect(v[`c${i}`]).toBe(ansi[i]);
    expect(vars(themeStyle("auto", null, null)).c0).toBeUndefined();
  });

  test("the terminal theme of herdr takes the terminal colors", () => {
    const v = vars(themeStyle("auto", '[theme]\nname = "terminal"', darkTerm));
    expect([v.bg, v.fg, v.accent, v.err, v.muted]).toEqual([darkTerm.bg, darkTerm.fg, ansi[4], ansi[9], ansi[7]]);
    expect(v["sel-bg"]).toBeUndefined();
  });

  test("without terminal colors, the terminal theme keeps the built-in colors of the page", () => {
    expect(themeStyle("auto", '[theme]\nname = "terminal"', null)).toBe("");
    expect(themeStyle("light", '[theme]\nname = "terminal"', null)).toBe(":root, :root:root { color-scheme: light; }");
  });

  test("sets color-scheme from the background", () => {
    expect(themeStyle("auto", '[theme]\nname = "gruvbox"', null)).toContain("color-scheme: dark;");
    expect(themeStyle("light", '[theme]\nname = "gruvbox"', null)).toContain("color-scheme: light;");
  });

  test("only #rrggbb terminal values reach the CSS", () => {
    const bad = { fg: "red; } body { x: y", bg: "#1d2021", ansi: ["#zzzzzz", 5] } as unknown as TerminalColors;
    const css = themeStyle("auto", '[theme]\nname = "terminal"', bad);
    expect(css.match(/[{}]/g)).toHaveLength(2);
    expect(vars(css)).toEqual({ bg: "#1d2021" });
  });
});

describe("parseTheme", () => {
  test("defaults to auto and takes the three modes", () => {
    expect(parseTheme({})).toEqual({ mode: "auto" });
    for (const mode of ["auto", "dark", "light"]) expect(parseTheme({ mode })).toEqual({ mode } as any);
  });

  test("refuses another mode or key", () => {
    expect(() => parseTheme({ mode: "x" })).toThrow(/theme\.mode/);
    expect(() => parseTheme({ colors: "x" })).toThrow(/unknown key theme\.colors/);
  });
});
