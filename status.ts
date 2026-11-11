// The status bar model: the footer of the agent screen, filtered and ordered by config.toml.
import { footer, type Mode, type ScreenChip } from "./screen.ts";

export type StatusAgent = { agent: string; agent_status: string; cwd?: string; foreground_cwd?: string; branch?: string };
// A chip from herdr agent data, not from the screen.
export type BuiltinChip = { type: "builtin"; name: Builtin; text: string };
export type Chip = ScreenChip | BuiltinChip;
export type StatusBar = { mode: Mode | null; chips: Chip[]; error: string | null };

const BUILTINS = {
  kind: (a: StatusAgent) => a.agent,
  cwd: (a: StatusAgent, home: string) => tilde(a.foreground_cwd || a.cwd || "", home),
  status: (a: StatusAgent) => a.agent_status,
  branch: (a: StatusAgent) => a.branch ?? "",
};
type Builtin = keyof typeof BUILTINS;
const isBuiltin = (s: string): s is Builtin => Object.hasOwn(BUILTINS, s);

const tilde = (path: string, home: string) => (path === home || path.startsWith(home + "/") ? "~" + path.slice(home.length) : path);

type StatusItem = { builtin: Builtin } | { regex: RegExp } | "*";
export type StatusConfig = { mode: boolean; hide: RegExp[]; items: StatusItem[] };

const DEFAULTS: StatusConfig = { mode: true, hide: [], items: ["*"] };

// The error is the config.toml error line of any table: the status bar shows it.
export function statusBar(screen: string, agent: StatusAgent | null, { status: config, error }: { status: StatusConfig; error: string | null }, home: string): StatusBar {
  const { mode, chips } = footer(screen);
  const shown = chips.filter((c) => !config.hide.some((r) => r.test(c.text)));
  const placed = new Set<ScreenChip>();
  const out: Chip[] = [];
  const place = (keep: (c: ScreenChip) => boolean) => {
    for (const c of shown) if (!placed.has(c) && keep(c)) placed.add(c), out.push(c);
  };
  for (const item of config.items) {
    if (item === "*") place(() => true);
    else if ("regex" in item) place((c) => item.regex.test(c.text));
    else {
      const text = agent ? BUILTINS[item.builtin](agent, home) : "";
      if (text) out.push({ type: "builtin", name: item.builtin, text });
    }
  }
  return { mode: config.mode ? mode : null, chips: out, error };
}

// True when the config lists the branch item, so the server runs git only then.
export const usesBranch = (config: StatusConfig) => config.items.some((i) => typeof i === "object" && "builtin" in i && i.builtin === "branch");

// The [status] table of config.toml.
export function parseStatus(status: Record<string, unknown>): StatusConfig {
  const config = { ...DEFAULTS };
  for (const [key, value] of Object.entries(status)) {
    if (key === "mode") {
      if (typeof value !== "boolean") throw new Error("status.mode must be true or false");
      config.mode = value;
    } else if (key === "hide") {
      config.hide = stringList(key, value).map((s, i) => parseRegex(`status.hide[${i}]`, s));
    } else if (key === "items") {
      config.items = stringList(key, value).map((s, i) => parseItem(`status.items[${i}]`, s));
    } else {
      throw new Error(`unknown key status.${key}`);
    }
  }
  return config;
}

function stringList(key: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new Error(`status.${key} must be a list of strings`);
  return value;
}

function parseItem(where: string, s: string): StatusItem {
  if (s === "*") return "*";
  if (isBuiltin(s)) return { builtin: s };
  if (s.startsWith("/")) return { regex: parseRegex(where, s) };
  throw new Error(`${where}: unknown item "${s}" (use ${Object.keys(BUILTINS).join(", ")}, "*" or "/regex/")`);
}

// A "/source/flags" string. g and y make test() keep state, so they are dropped.
function parseRegex(where: string, s: string): RegExp {
  const m = s.match(/^\/(.*)\/([a-z]*)$/s);
  if (!m) throw new Error(`${where}: "${s}" is not a /regex/`);
  try {
    return new RegExp(m[1], m[2].replace(/[gy]/g, ""));
  } catch (e) {
    throw new Error(`${where}: ${(e as Error).message}`);
  }
}
