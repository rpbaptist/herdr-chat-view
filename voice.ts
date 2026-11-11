// Dictation through a system tool. The tool records and transcribes on this
// machine and writes the text to a file. The server puts the text in the draft,
// so no key goes to a focused window and no audio goes to the page.
import { readFileSync, rmSync } from "node:fs";

export const VOICE_TOOLS = ["voxtype"] as const;
export type VoiceTool = (typeof VOICE_TOOLS)[number];
export type VoiceConfig = { tool: VoiceTool | "auto" | "off" };
export type VoiceState = "idle" | "recording" | "transcribing";
// What the page gets: null hides the button; a null tool disables it, with the reason as tooltip.
export type VoiceSettings = { tool: VoiceTool } | { tool: null; reason: string } | null;
export type Exec = (argv: string[]) => Promise<{ code: number; out: string; err: string }>;
type Result = { text: string } | { error: string };

type Descriptor = {
  bin: string;
  status: string[];
  // null when the tool cannot record now (for example, its daemon does not run).
  readStatus: (out: string) => VoiceState | null;
  start: (file: string) => string[];
  stop: string[];
  cancel: string[];
  // The result after the tool wrote it, null before.
  result: (file: string) => Result | null;
};

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

export const TOOLS: Record<VoiceTool, Descriptor> = {
  // `record start --file` sends the text of this one recording to the file, then
  // writes "<file>.done" ({"status":"ok","chars":5}). `status` prints idle,
  // recording, transcribing, or stopped when the daemon does not run.
  voxtype: {
    bin: "voxtype",
    status: ["status"],
    readStatus: (out) => {
      const s = out.trim();
      return s === "idle" || s === "recording" || s === "transcribing" ? s : null;
    },
    start: (file) => ["record", "start", `--file=${file}`],
    stop: ["record", "stop"],
    cancel: ["record", "cancel"],
    result: (file) => {
      const done = read(`${file}.done`);
      if (done === null) return null;
      let marker: { status?: string; error?: string } = {};
      try {
        marker = JSON.parse(done);
      } catch {}
      if (marker.status !== "ok") return { error: `voxtype: ${marker.error ?? marker.status ?? "no transcription"}` };
      return { text: (read(file) ?? "").trim() };
    },
  },
};

export function parseVoice(voice: Record<string, unknown>): VoiceConfig {
  const config: VoiceConfig = { tool: "auto" };
  const values = ["auto", "off", ...VOICE_TOOLS];
  for (const [key, value] of Object.entries(voice)) {
    if (key !== "tool") throw new Error(`unknown key voice.${key}`);
    if (!values.includes(value as string)) throw new Error(`voice.tool must be ${values.map((v) => `"${v}"`).join(" or ")}`);
    config.tool = value as VoiceConfig["tool"];
  }
  return config;
}

// which gives the path of a program, or null when it is not on PATH.
export function voiceSettings({ tool }: VoiceConfig, which: (bin: string) => string | null): VoiceSettings {
  if (tool === "off") return null;
  const tools = tool === "auto" ? VOICE_TOOLS : [tool];
  const found = tools.find((t) => which(TOOLS[t].bin));
  if (found) return { tool: found };
  const bins = tools.map((t) => TOOLS[t].bin).join(" or ");
  return { tool: null, reason: `Dictation needs ${bins} on PATH (or set [voice] tool = "off")` };
}

// The dictated text after the draft, with one space or the draft's own line end between.
export const appendText = (draft: string, text: string) => (!draft || /\s$/.test(draft) ? draft + text : `${draft} ${text}`);

export type Dictation = {
  pane: string;
  state: VoiceState;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  // The text when the tool is done ("" when it gave none), null while it records or transcribes.
  poll: () => Promise<string | null>;
};

// Polls in a row that see the tool idle with no result before the dictation ends
// with no text: the tool's own cancel key, or speech with no words.
const IDLE_POLLS = 3;

// One dictation, from start to the text. `file` is a new path in a private directory.
export async function startDictation(tool: VoiceTool, bin: string, exec: Exec, file: string, pane: string): Promise<Dictation> {
  const t = TOOLS[tool];
  const run = async (args: string[]) => {
    const r = await exec([bin, ...args]);
    if (r.code !== 0) throw new Error((r.err || r.out).trim().split("\n")[0] || `${t.bin} ${args.join(" ")} failed (${r.code})`);
    return r.out;
  };
  const status = async () => {
    const out = await run(t.status);
    const s = t.readStatus(out);
    if (!s) throw new Error(`${t.bin} cannot record: ${out.trim() || "no status"}`);
    return s;
  };
  const clean = () => {
    rmSync(file, { force: true });
    rmSync(`${file}.done`, { force: true });
  };

  const now = await status();
  if (now !== "idle") throw new Error(`${t.bin} is busy (${now})`);
  clean();
  await run(t.start(file));
  let idle = 0;
  const d: Dictation = {
    pane,
    state: "recording",
    async stop() {
      if (d.state !== "recording") return;
      await run(t.stop);
      d.state = "transcribing";
    },
    async cancel() {
      try {
        await run(t.cancel);
      } finally {
        clean();
        d.state = "idle";
      }
    },
    async poll() {
      const r = t.result(file);
      if (r) {
        clean();
        d.state = "idle";
        if ("error" in r) throw new Error(r.error);
        return r.text;
      }
      let s: VoiceState;
      try {
        s = await status();
      } catch (e) {
        clean();
        d.state = "idle";
        throw e;
      }
      if (s !== "idle") {
        idle = 0;
        d.state = s;
        return null;
      }
      if (++idle < IDLE_POLLS) return null;
      clean();
      d.state = "idle";
      return "";
    },
  };
  return d;
}
