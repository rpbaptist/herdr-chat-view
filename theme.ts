// The [theme] table of config.toml, and the terminal colors that the page gets as CSS variables.
export const THEME_MODES = ["auto", "dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
// The paths of the colors files. A path can start with `~/`.
export type ThemeConfig = { mode: ThemeMode; colors: string | null; dark_colors: string | null; light_colors: string | null };
const FILES = ["colors", "dark_colors", "light_colors"] as const;

export function parseTheme(theme: Record<string, unknown>): ThemeConfig {
  const config: ThemeConfig = { mode: "auto", colors: null, dark_colors: null, light_colors: null };
  for (const [key, value] of Object.entries(theme)) {
    if (key === "mode") {
      if (!THEME_MODES.includes(value as ThemeMode)) throw new Error('theme.mode must be "auto", "dark" or "light"');
      config.mode = value as ThemeMode;
    } else if ((FILES as readonly string[]).includes(key)) {
      if (typeof value !== "string" || !value) throw new Error(`theme.${key} must be a file path`);
      config[key as (typeof FILES)[number]] = value;
    } else throw new Error(`unknown key theme.${key}`);
  }
  return config;
}

const luminance = (hex: string) => {
  const h = hex.slice(1);
  const full = h.length <= 4 ? [...h.slice(0, 3)].map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Terminal colors from a colors file (background, foreground, color0 to color15 as "#hex"), as CSS variables.
export function themeCss(toml: string): string {
  const c: Record<string, string> = {};
  for (const m of toml.matchAll(/^\s*(\w+)\s*=\s*"(#[0-9a-fA-F]{3,8})"/gm)) c[m[1]] = m[2];
  if (!c.background || !c.foreground) return "";
  const vars: Record<string, string | undefined> = {
    bg: c.background, fg: c.foreground, muted: c.color8, accent: c.color3 ?? c.color11, // herdr themes use the normal yellow as accent
    ok: c.color2, warn: c.color3, err: c.color1, "sel-bg": c.selection_background, "sel-fg": c.selection_foreground,
  };
  for (let i = 0; i < 16; i++) vars[`c${i}`] = c[`color${i}`];
  const body = Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `--${k}: ${v};`).join(" ");
  return `:root, :root:root { color-scheme: ${luminance(c.background) < 0.5 ? "dark" : "light"}; ${body} }`;
}

// The theme.css text. `colors(path)` gives the text of a colors file, or null.
// Auto is the colors file. Dark and light use their own colors file, else the built-in palette
// (dark: the colors file first). The page holds both built-in palettes, and color-scheme picks one.
export function themeStyle(theme: ThemeConfig, colors: (path: string) => string | null): string {
  const css = (path: string | null) => (path ? themeCss(colors(path) ?? "") : "");
  const { mode } = theme;
  if (mode === "auto") return css(theme.colors);
  return css(theme[`${mode}_colors`]) || (mode === "dark" && css(theme.colors)) || `:root:root { color-scheme: ${mode}; }`;
}
