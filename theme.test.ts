import { expect, test } from "bun:test";
import { themeCss } from "./theme.ts";

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
