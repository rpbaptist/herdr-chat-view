// The [theme] table of config.toml, and the terminal colors that the page gets as CSS variables.
export const THEME_MODES = ["auto", "dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ThemeConfig = { mode: ThemeMode };

export function parseTheme(theme: Record<string, unknown>): ThemeConfig {
  const config: ThemeConfig = { mode: "auto" };
  for (const [key, value] of Object.entries(theme)) {
    if (key !== "mode") throw new Error(`unknown key theme.${key}`);
    if (!THEME_MODES.includes(value as ThemeMode)) throw new Error('theme.mode must be "auto", "dark" or "light"');
    config.mode = value as ThemeMode;
  }
  return config;
}

const luminance = (hex: string) => {
  const h = hex.slice(1);
  const full = h.length <= 4 ? [...h.slice(0, 3)].map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Terminal colors from an Omarchy theme colors.toml, as CSS variables.
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

// A theme name from herdr's config is a directory name: no path.
const NAME = /^[\w][\w.-]*$/;

// The dark_name and light_name of [theme] in herdr's config.toml. Null for a missing or bad value.
export function herdrThemes(text: string | null): { dark: string | null; light: string | null } {
  let theme: Record<string, unknown> = {};
  try {
    theme = (Bun.TOML.parse(text ?? "") as { theme?: Record<string, unknown> }).theme ?? {};
  } catch {}
  const name = (v: unknown) => (typeof v === "string" && NAME.test(v) ? v : null);
  return { dark: name(theme.dark_name), light: name(theme.light_name) };
}

// The theme.css text. `colors(name)` gives the colors.toml text of the named Omarchy theme, or null; `colors(null)` is the active theme.
// Auto is the active theme. Dark and light use the herdr theme of that name, else the built-in palette
// (dark: the active theme first). The page holds both built-in palettes, and color-scheme picks one.
export function themeStyle(mode: ThemeMode, herdrConfig: string | null, colors: (name: string | null) => string | null): string {
  const css = (name: string | null) => themeCss(colors(name) ?? "");
  if (mode === "auto") return css(null);
  const names = herdrThemes(herdrConfig);
  return (names[mode] && css(names[mode])) || (mode === "dark" && css(null)) || `:root:root { color-scheme: ${mode}; }`;
}
