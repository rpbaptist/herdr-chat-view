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
  return `:root, :root:root { ${body} }`;
}
