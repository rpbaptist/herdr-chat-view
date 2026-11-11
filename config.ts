// config.toml: one table per feature, one parser per table.
import { parseStatus, statusSettings, type StatusSettings } from "./status.ts";
import { parseFont } from "./fonts.ts";
import { parseTheme, type ThemeMode } from "./theme.ts";
import { parseVoice, voiceSettings, type VoiceSettings } from "./voice.ts";
import { setKey, type Value } from "./config-edit.ts";

export type SendKey = "enter" | "ctrl-enter";
export type InputConfig = { sendKey: SendKey };
// What the server sends to each page, apart from the status bar. error is the config.toml error line: the page does not write while there is one.
export type Settings = { sendKey: SendKey; themeMode: ThemeMode; status: StatusSettings; error: string | null; voice: VoiceSettings };

const SEND_KEYS: SendKey[] = ["enter", "ctrl-enter"];

function parseInput(input: Record<string, unknown>): InputConfig {
  const config: InputConfig = { sendKey: "enter" };
  for (const [key, value] of Object.entries(input)) {
    if (key !== "send_key") throw new Error(`unknown key input.${key}`);
    if (!SEND_KEYS.includes(value as SendKey)) throw new Error(`input.send_key must be ${SEND_KEYS.map((k) => `"${k}"`).join(" or ")}`);
    config.sendKey = value as SendKey;
  }
  return config;
}

// A new table is one new entry here.
const TABLES = { status: parseStatus, input: parseInput, font: parseFont, theme: parseTheme, voice: parseVoice };
type Tables = { [K in keyof typeof TABLES]: ReturnType<(typeof TABLES)[K]> };
export type Config = Tables & { error: string | null };

const isTable = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTableName = (k: string): k is keyof Tables => Object.hasOwn(TABLES, k);
const NAMES = Object.keys(TABLES).map((k) => `[${k}]`).join(" or ");

function parseTables(toml: Record<string, unknown>): Tables {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(toml)) {
    if (!isTableName(key)) throw new Error(isTable(toml[key]) ? `unknown table ${key} (use ${NAMES})` : `unknown key ${key} (put the settings in ${NAMES})`);
  }
  for (const [name, parse] of Object.entries(TABLES)) {
    const table = toml[name] ?? {};
    if (!isTable(table)) throw new Error(`${name} must be a table`);
    out[name] = parse(table);
  }
  return out as Tables;
}

const DEFAULTS = parseTables({});

// which finds a program on PATH; the server passes Bun.which.
export const pageSettings = (config: Config, which: (bin: string) => string | null): Settings =>
  ({ sendKey: config.input.sendKey, themeMode: config.theme.mode, status: statusSettings(config.status), error: config.error, voice: voiceSettings(config.voice, which) });

// The last config text and its result: the server resolves the config every second.
let cache: { text: string | null; config: Config } | null = null;

// A missing file gives the defaults. A file with an error gives the defaults and one error line.
export function loadConfig(text: string | null): Config {
  if (cache?.text !== text) {
    let config: Config;
    try {
      config = { ...(text === null ? DEFAULTS : parseTables(Bun.TOML.parse(text) as Record<string, unknown>)), error: null };
    } catch (e) {
      config = { ...DEFAULTS, error: `config.toml: ${(e as Error).message.split("\n")[0]}` };
    }
    cache = { text, config };
  }
  return cache.config;
}

// The config text with one key set, or an Error that names the problem. Only a valid file comes back.
export function updateConfig(text: string | null, table: string, key: string, value: Value): string {
  if (!isTableName(table)) throw new Error(`unknown table ${table} (use ${NAMES})`);
  const next = setKey(text ?? "", table, key, value);
  const { error } = loadConfig(next);
  if (error) throw new Error(error);
  return next;
}
