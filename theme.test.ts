import { describe, expect, test } from "bun:test";
import { parseTheme, themeCss, themeStyle, type ThemeConfig } from "./theme.ts";

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
const files: Record<string, string> = { "/t/colors.toml": toml, "/t/dark.toml": toml, "/t/light.toml": light };
const colors = (path: string) => files[path] ?? null;
const NONE: ThemeConfig = { mode: "auto", colors: null, dark_colors: null, light_colors: null };
const ALL: ThemeConfig = { mode: "auto", colors: "/t/colors.toml", dark_colors: "/t/dark.toml", light_colors: "/t/light.toml" };

test("sets color-scheme from the background of the theme", () => {
  expect(themeCss(toml)).toContain("color-scheme: dark;");
  expect(themeCss(light)).toContain("color-scheme: light;");
});

describe("themeStyle", () => {
  test("auto is the colors file, and nothing without one", () => {
    expect(themeStyle(ALL, colors)).toBe(themeCss(toml));
    expect(themeStyle(NONE, colors)).toBe("");
    expect(themeStyle({ ...NONE, colors: "/t/missing.toml" }, colors)).toBe("");
  });

  test("light is the light_colors file", () => {
    expect(themeStyle({ ...ALL, mode: "light" }, colors)).toBe(themeCss(light));
  });

  test("light is the built-in palette without a light_colors file, even with a colors file", () => {
    const css = ":root:root { color-scheme: light; }";
    expect(themeStyle({ ...ALL, mode: "light", light_colors: null }, colors)).toBe(css);
    expect(themeStyle({ ...ALL, mode: "light", light_colors: "/t/missing.toml" }, colors)).toBe(css);
  });

  test("dark is the dark_colors file, else the colors file, else the built-in palette", () => {
    expect(themeStyle({ ...ALL, mode: "dark", dark_colors: "/t/light.toml" }, colors)).toBe(themeCss(light));
    expect(themeStyle({ ...ALL, mode: "dark", dark_colors: null }, colors)).toBe(themeCss(toml));
    expect(themeStyle({ ...ALL, mode: "dark", dark_colors: "/t/missing.toml" }, colors)).toBe(themeCss(toml));
    expect(themeStyle({ ...NONE, mode: "dark" }, colors)).toBe(":root:root { color-scheme: dark; }");
  });

  test("reads the colors file of the mode only", () => {
    const asked: string[] = [];
    themeStyle({ ...ALL, mode: "light" }, (p) => (asked.push(p), colors(p)));
    expect(asked).toEqual(["/t/light.toml"]);
  });
});

describe("parseTheme", () => {
  test("defaults to auto and takes the three modes", () => {
    expect(parseTheme({})).toEqual(NONE);
    for (const mode of ["auto", "dark", "light"]) expect(parseTheme({ mode })).toEqual({ ...NONE, mode } as ThemeConfig);
  });

  test("takes the three colors files", () => {
    const { mode, ...paths } = ALL;
    expect(parseTheme(paths)).toEqual(ALL);
    expect(parseTheme({ colors: "~/colors.toml" }).colors).toBe("~/colors.toml");
  });

  test("refuses another mode or key", () => {
    expect(() => parseTheme({ mode: "x" })).toThrow(/theme\.mode/);
    expect(() => parseTheme({ nme: "x" })).toThrow(/unknown key theme\.nme/);
    expect(() => parseTheme({ colors: 1 })).toThrow(/theme\.colors must be a file path/);
    expect(() => parseTheme({ light_colors: "" })).toThrow(/theme\.light_colors must be a file path/);
  });
});
