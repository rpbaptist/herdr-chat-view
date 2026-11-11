// The [font] table of config.toml, and the CSS variables that the page gets from it.
export type FontConfig = { sans: string[] | "terminal" | null; mono: string[] | null; size: number; monoSize: number };

const DEFAULT_SANS = '"Inter", "Geist", system-ui, -apple-system, "Segoe UI", sans-serif';
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);
// A family name that cannot end a CSS string or a declaration.
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._+-]*$/u;
const SIZE_MIN = 8, SIZE_MAX = 40;

// A comma separated list of family names, each one optionally in quotes.
export function parseFamilies(value: unknown, key: string): string[] {
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  const names = value.split(",").map((s) => s.trim().replace(/^(["'])(.*)\1$/, "$2").trim());
  if (value.length > 200) throw new Error(`${key} is too long`);
  for (const name of names) {
    if (!NAME.test(name)) throw new Error(`${key}: bad font name ${JSON.stringify(name)} (use letters, digits, spaces and . _ + - only)`);
  }
  return names;
}

function parseSize(value: unknown, key: string): number {
  if (typeof value !== "number" || !(value >= SIZE_MIN && value <= SIZE_MAX)) throw new Error(`${key} must be a number from ${SIZE_MIN} to ${SIZE_MAX}`);
  return value;
}

export function parseFont(font: Record<string, unknown>): FontConfig {
  const config: FontConfig = { sans: null, mono: null, size: 15, monoSize: 13 };
  for (const [key, value] of Object.entries(font)) {
    if (key === "sans") config.sans = value === "terminal" ? "terminal" : parseFamilies(value, "font.sans");
    else if (key === "mono") config.mono = parseFamilies(value, "font.mono");
    else if (key === "size") config.size = parseSize(value, "font.size");
    else if (key === "mono_size") config.monoSize = parseSize(value, "font.mono_size");
    else throw new Error(`unknown key font.${key}`);
  }
  return config;
}

const quote = (name: string) => (GENERIC.has(name.toLowerCase()) ? name.toLowerCase() : `"${name}"`);
const stack = (names: string[], last: string) => [...names.map(quote), ...(names.at(-1)?.toLowerCase() === last ? [] : [last])].join(", ");

// The stacks end in a generic family, so the fallback keeps working.
export function fontCss(font: FontConfig): string {
  const mono = stack(font.mono ?? [], "monospace");
  const sans = font.sans === "terminal" ? mono : font.sans ? stack(font.sans, "sans-serif") : DEFAULT_SANS;
  return `:root, :root:root { --sans: ${sans}; --mono: ${mono}; --fs: ${font.size}px; --ms: ${font.monoSize}px; }`;
}
