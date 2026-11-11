import { describe, expect, test } from "bun:test";
import { herdrThemes, parseTheme, themeCss, themeStyle } from "./theme.ts";

const toml = `
background = "#1a1b26"
foreground = "#a9b1d6"
selection_background = "#33467c"
color1 = "#f7768e"
color2 = "#9ece6a"
color3 = "#e0af68"
color8 = "#444b6a"
not_a_color = "red"
`;

test("maps theme colors to CSS variables", () => {
  const css = themeCss(toml);
  expect(css.startsWith(":root, :root:root {")).toBe(true);
  for (const decl of ["--bg: #1a1b26;", "--fg: #a9b1d6;", "--muted: #444b6a;", "--accent: #e0af68;", "--ok: #9ece6a;",
    "--err: #f7768e;", "--sel-bg: #33467c;", "--c1: #f7768e;", "--c8: #444b6a;"]) {
    expect(css).toContain(decl);
  }
});

test("leaves out colors the theme does not set", () => {
  const css = themeCss(toml);
  expect(css).not.toContain("--sel-fg");
  expect(css).not.toContain("--c9");
  expect(css).not.toContain("red");
});

test("uses the bright yellow as accent when the normal yellow is missing", () => {
  expect(themeCss('background = "#000"\nforeground = "#fff"\ncolor11 = "#ff0"')).toContain("--accent: #ff0;");
});

test("returns empty without background and foreground", () => {
  expect(themeCss('background = "#000"')).toBe("");
  expect(themeCss("")).toBe("");
});

const light = 'background = "#f9f5d7"\nforeground = "#282828"';
const herdr = '[theme]\nname = "gruvbox"\ndark_name = "gruvbox"\nlight_name = "gruvbox-light"\n';
const themes: Record<string, string> = { active: toml, gruvbox: toml, "gruvbox-light": light };
const colors = (name: string | null) => themes[name ?? "active"] ?? null;

test("sets color-scheme from the background of the theme", () => {
  expect(themeCss(toml)).toContain("color-scheme: dark;");
  expect(themeCss(light)).toContain("color-scheme: light;");
});

describe("herdrThemes", () => {
  test("reads dark_name and light_name", () => {
    expect(herdrThemes(herdr)).toEqual({ dark: "gruvbox", light: "gruvbox-light" });
  });

  test("gives null for a missing file, a bad file, a missing key and a name that is a path", () => {
    expect(herdrThemes(null)).toEqual({ dark: null, light: null });
    expect(herdrThemes("[theme")).toEqual({ dark: null, light: null });
    expect(herdrThemes('[theme]\nname = "x"')).toEqual({ dark: null, light: null });
    expect(herdrThemes('[theme]\ndark_name = "../x"\nlight_name = ".hidden"')).toEqual({ dark: null, light: null });
    expect(herdrThemes('[theme]\ndark_name = 1\nlight_name = ""')).toEqual({ dark: null, light: null });
  });
});

describe("themeStyle", () => {
  test("auto is the active theme, and nothing without one", () => {
    expect(themeStyle("auto", herdr, colors)).toBe(themeCss(toml));
    expect(themeStyle("auto", herdr, () => null)).toBe("");
  });

  test("light is the light_name theme", () => {
    expect(themeStyle("light", herdr, colors)).toBe(themeCss(light));
  });

  test("light is the built-in palette without a light_name theme, even with an active theme", () => {
    const css = ":root:root { color-scheme: light; }";
    expect(themeStyle("light", null, colors)).toBe(css);
    expect(themeStyle("light", '[theme]\nlight_name = "missing"', colors)).toBe(css);
  });

  test("dark is the dark_name theme, else the active theme, else the built-in palette", () => {
    expect(themeStyle("dark", '[theme]\ndark_name = "gruvbox-light"', colors)).toBe(themeCss(light));
    expect(themeStyle("dark", null, colors)).toBe(themeCss(toml));
    expect(themeStyle("dark", '[theme]\ndark_name = "missing"', colors)).toBe(themeCss(toml));
    expect(themeStyle("dark", null, () => null)).toBe(":root:root { color-scheme: dark; }");
  });

  test("asks for the colors of the named theme only", () => {
    const asked: (string | null)[] = [];
    themeStyle("light", herdr, (n) => (asked.push(n), colors(n)));
    expect(asked).toEqual(["gruvbox-light"]);
  });
});

describe("parseTheme", () => {
  test("defaults to auto and takes the three modes", () => {
    expect(parseTheme({})).toEqual({ mode: "auto" });
    for (const mode of ["auto", "dark", "light"]) expect(parseTheme({ mode })).toEqual({ mode } as any);
  });

  test("refuses another mode or key", () => {
    expect(() => parseTheme({ mode: "x" })).toThrow(/theme\.mode/);
    expect(() => parseTheme({ nme: "x" })).toThrow(/unknown key theme\.nme/);
  });
});
