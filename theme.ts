// The [theme] table of config.toml, and the colors that the page gets as CSS variables:
// the herdr theme first, the terminal colors second.
import { ALIASES, SIBLINGS, SLOTS, THEMES, type HerdrColor, type Slot } from "./herdr-themes.ts";
import type { TerminalColors } from "./terminal-colors.ts";

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

type Palette = Record<Slot, HerdrColor>;
type Table = Record<string, unknown>;

const isTable = (v: unknown): v is Table => typeof v === "object" && v !== null && !Array.isArray(v);
const normalize = (name: string) => name.toLowerCase().replace(/[ _]/g, "-");

// herdr's names for the 16 ANSI colors.
const ANSI_NAMES: Record<string, number> = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, purple: 5, cyan: 6, white: 15, gray: 7, grey: 7,
  darkgray: 8, darkgrey: 8, lightred: 9, lightgreen: 10, lightyellow: 11, lightblue: 12, lightmagenta: 13, lightcyan: 14,
};

// A [theme.custom] value, read as herdr reads it. herdr gives cyan for a value that it does not know.
function herdrColor(value: unknown): HerdrColor {
  const s = String(value).trim().toLowerCase();
  if (["reset", "default", "none", "transparent"].includes(s)) return null;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join("")}`;
  const rgb = /^rgb\((.*)\)$/.exec(s)?.[1].split(",").map((p) => Number(p.trim()));
  if (rgb?.length === 3 && rgb.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return ANSI_NAMES[s] ?? ANSI_NAMES.cyan;
}

function override(palette: Palette, custom: unknown): Palette {
  if (!isTable(custom)) return palette;
  const out = { ...palette };
  for (const slot of SLOTS) if (slot in custom && !isTable(custom[slot])) out[slot] = herdrColor(custom[slot]);
  return out;
}

// herdr's light or dark test for a background color.
const isLight = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r * 299 + g * 587 + b * 114 >= 128_000;
};

// The herdr palette for the page mode, resolved as herdr resolves its own theme from config.toml.
// Auto is the theme that herdr shows: `name`, or with `auto_switch` the dark or light theme for the terminal background.
export function herdrPalette(herdrConfig: string | null, mode: ThemeMode, terminalBg: string | null): Palette {
  let config: Table = {};
  try {
    config = Bun.TOML.parse(herdrConfig ?? "") as Table;
  } catch {}
  const theme = isTable(config.theme) ? config.theme : {};
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const name = str(theme.name) ?? "catppuccin";
  const [darkSibling, lightSibling] = SIBLINGS[normalize(name)] ?? [name, name];
  const appearance = mode !== "auto" ? mode : theme.auto_switch === true ? (terminalBg && isLight(terminalBg) ? "light" : "dark") : null;
  const [chosen, fallback] =
    appearance === "dark" ? [str(theme.dark_name) ?? darkSibling, "catppuccin"]
    : appearance === "light" ? [str(theme.light_name) ?? lightSibling, "catppuccin-latte"]
    : [name, "catppuccin"];
  const custom = isTable(theme.custom) ? theme.custom : {};
  let palette = override(THEMES[ALIASES[normalize(chosen)]] ?? THEMES[fallback], custom);
  const ui = isTable(config.ui) ? config.ui : {};
  if (typeof ui.accent === "string" && ui.accent !== "cyan" && !("accent" in custom)) palette = { ...palette, accent: herdrColor(ui.accent) };
  return appearance ? override(palette, custom[appearance]) : palette;
}

// The terminal colors file is data from disk: only "#rrggbb" values reach the CSS.
function checked(t: TerminalColors): TerminalColors {
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  return { fg: hex(t.fg), bg: hex(t.bg), ansi: Array.from({ length: 16 }, (_, i) => hex(Array.isArray(t.ansi) ? t.ansi[i] : null)) };
}

// The page variable for each herdr slot. The ANSI colors c0 to c15 come from the terminal only.
const VARS: [string, Slot][] = [
  ["bg", "panel_bg"], ["fg", "text"], ["muted", "overlay0"], ["accent", "accent"],
  ["ok", "green"], ["warn", "yellow"], ["err", "red"], ["sel-bg", "selection_bg"],
  ["working", "yellow"], ["blocked", "red"], ["done", "blue"], ["idle", "green"],
];

// The theme.css text. A herdr color that is an ANSI index or the terminal default takes the terminal color.
// A color that neither gives keeps the built-in value of the page, and color-scheme picks the built-in light or dark set.
export function themeStyle(mode: ThemeMode, herdrConfig: string | null, terminalFile: TerminalColors | null): string {
  const terminal = terminalFile && checked(terminalFile);
  const palette = herdrPalette(herdrConfig, mode, terminal?.bg ?? null);
  const resolve = (slot: Slot): string | null => {
    const c = palette[slot];
    if (typeof c === "string") return c;
    if (typeof c === "number") return terminal?.ansi[c] ?? null;
    return slot === "panel_bg" ? terminal?.bg ?? null : slot === "text" ? terminal?.fg ?? null : null;
  };
  const vars: [string, string | null][] = VARS.map(([name, slot]) => [name, resolve(slot)]);
  for (let i = 0; i < 16; i++) vars.push([`c${i}`, terminal?.ansi[i] ?? null]);
  const bg = vars[0][1];
  const scheme = bg ? (isLight(bg) ? "light" : "dark") : mode === "auto" ? null : mode;
  const body = vars.filter(([, v]) => v).map(([k, v]) => `--${k}: ${v};`);
  if (scheme) body.unshift(`color-scheme: ${scheme};`);
  return body.length ? `:root, :root:root { ${body.join(" ")} }` : "";
}
