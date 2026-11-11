// herdr-chat: chat view on herdr agent sessions, drawn in the pane with pixel.
//
//   bun herdr-chat.ts toggle   switch the focused agent between terminal and chat view
//   bun herdr-chat.ts close    close the chat pane of the focused agent
//   bun herdr-chat.ts serve    run the local chat server (started by toggle)
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { inputText } from "./screen.ts";
import { loadConfig, pageSettings } from "./config.ts";
import { statusBar, usesBranch } from "./status.ts";
import { themeCss } from "./theme.ts";
import { branchCache } from "./branches.ts";
import { completions } from "./completions.ts";
import { agentOf, transcriptPath } from "./agents.ts";
import { addSkills, type Item, type Skill } from "./transcripts.ts";
import { appendText, startDictation, TOOLS, type Dictation, type Exec } from "./voice.ts";

const PLUGIN_ID = "rpbaptist.herdr-chat-view";
const IDLE_EXIT_MS = 10 * 60_000;
const HERDR = process.env.HERDR_BIN_PATH || "herdr";

const sessionKey = Bun.hash(process.env.HERDR_SOCKET_PATH ?? "default").toString(36);
const stateDir = join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), "herdr-chat", sessionKey);
const serverFile = join(stateDir, "server.json");
const panesFile = join(stateDir, "panes.json");
const themeFile = join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "omarchy/current/theme/colors.toml");
mkdirSync(stateDir, { recursive: true, mode: 0o700 });

// ---------- herdr CLI ----------

class HerdrError extends Error {}

async function herdr(args: string[]): Promise<any> {
  const proc = Bun.spawn([HERDR, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  let json: any = null;
  try {
    json = out.trim() ? JSON.parse(out) : null;
  } catch {}
  if (code !== 0 || json?.error) {
    const msg = json?.error?.message ?? json?.error?.code ?? (err.trim() || out.trim() || `herdr ${args[0]} failed`);
    throw new HerdrError(msg);
  }
  return json?.result ?? json ?? out;
}

const readJson = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
};

// Agent pane id -> chat pane id.
type PaneMap = Record<string, string>;
const loadPanes = () => readJson<PaneMap>(panesFile, {});
const savePanes = (m: PaneMap) => writeFileSync(panesFile, JSON.stringify(m));

async function paneExists(id: string): Promise<boolean> {
  try {
    await herdr(["pane", "get", id]);
    return true;
  } catch {
    return false;
  }
}

async function zoomOnly(pane: string, focus: () => Promise<unknown>) {
  await herdr(["pane", "zoom", pane, "--off"]).catch(() => {});
  await focus();
  await herdr(["pane", "zoom", pane, "--on"]);
}

const showTerminal = (agent: string) => zoomOnly(agent, () => herdr(["agent", "focus", agent]));
const showChat = (chat: string) => zoomOnly(chat, () => herdr(["plugin", "pane", "focus", chat]));

// ---------- server lifecycle ----------

type ServerInfo = { pid: number; port: number; token: string };

async function serverAlive(info: ServerInfo | null): Promise<boolean> {
  if (!info) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/health?t=${info.token}`, { signal: AbortSignal.timeout(500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(): Promise<ServerInfo> {
  let info = readJson<ServerInfo | null>(serverFile, null);
  if (await serverAlive(info)) return info!;
  const log = openSync(join(stateDir, "server.log"), "a");
  Bun.spawn(["setsid", "-f", process.execPath, import.meta.path, "serve"], { stdio: ["ignore", log, log], env: process.env });
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(100);
    info = readJson<ServerInfo | null>(serverFile, null);
    if (info?.pid !== undefined && (await serverAlive(info))) return info!;
  }
  throw new Error(`chat server did not start, see ${join(stateDir, "server.log")}`);
}

// ---------- actions ----------

async function notify(title: string, body: string) {
  await herdr(["notification", "show", title, "--body", body]).catch(() => console.error(`${title}: ${body}`));
}

async function toggle() {
  const focused = process.env.HERDR_PANE_ID;
  if (!focused) throw new Error("HERDR_PANE_ID is not set");
  const panes = loadPanes();
  const agent = Object.keys(panes).find((a) => panes[a] === focused) ?? focused;
  let chat = panes[agent] && (await paneExists(panes[agent])) ? panes[agent] : null;

  if (!chat) {
    let title = "";
    try {
      const { agent: a } = await herdr(["agent", "get", agent]);
      title = a?.label || a?.terminal_title_stripped || a?.agent || "";
    } catch {
      return notify("herdr-chat", "No agent in this pane");
    }
    const server = await ensureServer();
    const url = `http://127.0.0.1:${server.port}/?t=${server.token}#${encodeURIComponent(agent)}`;
    const res = await herdr([
      "plugin", "pane", "open", "--plugin", PLUGIN_ID, "--entrypoint", "chat",
      "--placement", "split", "--target-pane", agent, "--direction", "right",
      "--env", `HERDR_CHAT_URL=${url}`, "--focus",
    ]);
    chat = res?.plugin_pane?.pane?.pane_id;
    if (!chat) throw new Error(`unexpected plugin pane open result: ${JSON.stringify(res)}`);
    panes[agent] = chat;
    savePanes(panes);
    // Name the pane after the agent; an empty label shows pixel's process name.
    if (title) await herdr(["pane", "rename", chat, title]).catch(() => {});
    return switchView(server, agent, "chat");
  }

  const server = await ensureServer(); // the open page reconnects to the same port and token
  const { layout } = await herdr(["pane", "layout", "--pane", agent]);
  const view = layout?.zoomed && layout.focused_pane_id === chat ? "terminal" : "chat";
  return switchView(server, agent, view);
}

// The server moves the draft between the chat and the agent's input box.
async function switchView(server: ServerInfo, agent: string, view: "terminal" | "chat") {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/view?t=${server.token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pane: agent, view }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).error ?? `view switch failed: ${res.status}`);
}

// ---------- agent input box (Claude Code) ----------

async function readInput(agent: string): Promise<string | null> {
  return inputText(String(await herdr(["agent", "read", agent, "--source", "visible", "--format", "ansi"])));
}

async function close() {
  const focused = process.env.HERDR_PANE_ID;
  const panes = loadPanes();
  const agent = Object.keys(panes).find((a) => a === focused || panes[a] === focused);
  if (!agent) return;
  await herdr(["plugin", "pane", "close", panes[agent]]).catch(() => {});
  delete panes[agent];
  savePanes(panes);
  await herdr(["pane", "zoom", agent, "--off"]).catch(() => {});
  await herdr(["agent", "focus", agent]).catch(() => {});
}

// ---------- server ----------

type Agent = {
  pane_id: string;
  agent: string;
  agent_status: string;
  agent_session?: { value?: string };
  cwd?: string;
  foreground_cwd?: string;
  terminal_title_stripped?: string;
  label?: string;
  workspace_id?: string;
  tab_id?: string;
};

type Client = {
  pane: string;
  send: (event: string, data: unknown) => void;
  close: () => void;
  session?: string;
  path?: string | null;
  offset: number;
  seq: number;
  status?: string;
  settings?: string;
  skills: Map<string, Skill>;
};

// The status bar config. HERDR_CHAT_CONFIG overrides the path, so a test run does not touch the user's file.
// null when herdr cannot give the plugin config directory: the status bar then uses the defaults.
async function configPath(): Promise<string | null> {
  if (process.env.HERDR_CHAT_CONFIG) return process.env.HERDR_CHAT_CONFIG;
  const dir = String(await herdr(["plugin", "config-dir", PLUGIN_ID]).catch(() => "")).trim();
  return dir ? join(dir, "config.toml") : null;
}

// HERDR_CHAT_VOICE_BIN replaces the dictation tool, so a test run uses a fake tool and no microphone.
const which = (bin: string) => process.env.HERDR_CHAT_VOICE_BIN || Bun.which(bin);
const exec: Exec = async (argv) => {
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out, err, code };
};

// The config text, or null when the file is missing.
function readConfig(path: string | null): string | null {
  if (!path) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readTheme(): string {
  try {
    return themeCss(readFileSync(themeFile, "utf8"));
  } catch {
    return "";
  }
}

async function serve() {
  // Keep port and token across restarts, so open chat panes reconnect.
  const prev = readJson<ServerInfo | null>(serverFile, null);
  const token = prev?.token ?? crypto.randomUUID().replaceAll("-", "");
  const html = Bun.file(join(import.meta.dir, "index.html"));
  const clients = new Set<Client>();
  let agents: Agent[] = [];
  let agentsJson = "";
  let lastActive = Date.now();
  let theme = readTheme();
  const configFile = await configPath();
  let config = readConfig(configFile);
  // The page settings from config.toml, sent when a page connects and when a value changes.
  function sendSettings(c: Client) {
    const json = JSON.stringify(pageSettings(loadConfig(config), which));
    if (json === c.settings) return;
    c.settings = json;
    c.send("settings", JSON.parse(json));
  }
  const drafts = new Map<string, string>();
  function setDraft(pane: string, text: string) {
    drafts.set(pane, text);
    for (const c of clients) if (c.pane === pane) c.send("draft-set", text);
  }

  // Chat -> terminal: type the chat draft into an empty input box.
  async function toTerminal(pane: string) {
    await showTerminal(pane);
    const draft = drafts.get(pane) ?? "";
    if (!draft.trim() || agentFor(pane)?.agent !== "claude") return;
    if ((await readInput(pane).catch(() => null)) !== "") return;
    await herdr(["pane", "send-text", pane, draft.includes("\n") ? `\x1b[200~${draft}\x1b[201~` : draft]);
    setDraft(pane, "");
  }

  // Terminal -> chat: move the input box text into the chat draft. Clearing it
  // takes Esc twice, which would interrupt a working agent, so only when idle.
  async function toChat(pane: string) {
    const chat = loadPanes()[pane];
    if (!chat) throw new Error("no chat pane for this agent");
    const a = agentFor(pane);
    if (a?.agent === "claude" && (a.agent_status === "idle" || a.agent_status === "done")) {
      const text = await readInput(pane).catch(() => null);
      if (text) {
        const draft = drafts.get(pane)?.trim();
        setDraft(pane, draft ? `${draft}\n${text}` : text);
        await herdr(["agent", "send-keys", pane, "esc"]);
        await Bun.sleep(150);
        await herdr(["agent", "send-keys", pane, "esc"]);
      }
    }
    await showChat(chat);
  }

  const agentFor = (pane: string) => agents.find((a) => a.pane_id === pane);

  // Dictation: one at a time, as the system tool records for the whole machine.
  // Every page shows its state; only the page that started it gets the text.
  let dictation: Dictation | null = null;
  let starting = false;
  const voiceEvent = (): { state: string; pane: string | null; error?: string } => ({ state: dictation?.state ?? "idle", pane: dictation?.pane ?? null });
  const sendVoice = (data = voiceEvent()) => { for (const c of clients) c.send("voice", data); };
  async function voice(pane: string, action: string) {
    if (action === "start") {
      if (dictation || starting) throw new Error("dictation already runs");
      const v = pageSettings(loadConfig(config), which).voice;
      if (!v?.tool) throw new Error(v?.reason ?? "dictation is off");
      starting = true;
      try {
        dictation = await startDictation(v.tool, which(TOOLS[v.tool].bin)!, exec, join(stateDir, `voice-${Date.now()}.txt`), pane);
      } finally {
        starting = false;
      }
    } else if (action === "stop") await dictation?.stop();
    else if (action === "cancel") {
      const d = dictation;
      dictation = null;
      await d?.cancel();
    } else throw new Error(`unknown voice action ${action}`);
    sendVoice();
  }
  let polling = false;
  async function pollVoice() {
    const d = dictation;
    if (!d || polling) return;
    polling = true;
    const before = d.state;
    try {
      const text = await d.poll();
      if (dictation !== d) return;
      if (text) setDraft(d.pane, appendText(drafts.get(d.pane) ?? "", text));
      if (text !== null) dictation = null;
      if (text !== null || d.state !== before) sendVoice();
    } catch (e) {
      if (dictation === d) dictation = null;
      sendVoice({ ...voiceEvent(), pane: d.pane, error: (e as Error).message });
    } finally {
      polling = false;
    }
  }

  // Keep each chat pane named after its agent's current title.
  const labels = new Map<string, string>();
  function syncLabels() {
    const panes = loadPanes();
    for (const [agent, chat] of Object.entries(panes)) {
      const a = agentFor(agent);
      const title = a?.label || a?.terminal_title_stripped;
      if (!title || labels.get(chat) === title) continue;
      labels.set(chat, title);
      herdr(["pane", "rename", chat, title]).catch(() => labels.delete(chat));
    }
  }

  async function pollAgents() {
    try {
      const res = await herdr(["agent", "list"]);
      const next: Agent[] = res?.agents ?? [];
      const json = JSON.stringify(next.map(({ pane_id, agent, agent_status, agent_session, cwd, foreground_cwd, terminal_title_stripped, label, workspace_id, tab_id }) =>
        ({ pane_id, agent, agent_status, session: agent_session?.value, cwd: foreground_cwd ?? cwd, title: label || terminal_title_stripped, workspace_id, tab_id })));
      agents = next;
      syncLabels();
      if (json !== agentsJson) {
        agentsJson = json;
        for (const c of clients) c.send("agents", JSON.parse(json));
      }
    } catch (e) {
      console.error("agent list:", (e as Error).message);
    }
  }

  // Send new transcript lines to a client. Reset when the agent changes session.
  async function pump(c: Client) {
    const a = agentFor(c.pane);
    const session = a?.agent_session?.value;
    const agent = agentOf(a?.agent);
    const key = `${a?.agent}/${session}`;
    if (key !== c.session) {
      c.session = key;
      c.offset = 0;
      c.seq = 0;
      c.path = a && session && agent ? await transcriptPath(a.agent, session) : null;
      c.send("reset", { kind: a?.agent ?? null, transcript: !!c.path, parsed: !!(a && agent) });
      c.skills = new Map();
      c.send("completions", completions(a?.agent, []));
    }
    // A new session writes its transcript only after the first message.
    if (!c.path && a && session && agent) {
      c.path = await transcriptPath(a.agent, session);
      if (c.path) c.send("reset", { kind: a.agent, transcript: true, parsed: true });
    }
    if (!c.path || !a || !agent) return;
    const file = Bun.file(c.path);
    if (file.size <= c.offset) return;
    const bytes = new Uint8Array(await file.slice(c.offset).arrayBuffer());
    const end = bytes.lastIndexOf(10);
    if (end < 0) return;
    c.offset += end + 1;
    const lines: unknown[] = [];
    const items: Item[] = [];
    for (const text of new TextDecoder().decode(bytes.subarray(0, end)).split("\n")) {
      if (!text) continue;
      try {
        const line = JSON.parse(text);
        lines.push(line);
        items.push(...agent.parse(line, c.seq++));
      } catch {}
    }
    if (items.length) c.send("items", items);
    if (addSkills(c.skills, agent.parseSkills(lines))) c.send("completions", completions(a.agent, c.skills.values()));
  }

  const branches = branchCache();
  setInterval(pollAgents, 1000);
  setInterval(pollVoice, 500);
  setInterval(() => {
    for (const c of clients) pump(c).catch((e) => console.error("pump:", e));
    if (clients.size) lastActive = Date.now();
    else if (Date.now() - lastActive > IDLE_EXIT_MS) shutdown();
  }, 500);
  setInterval(() => {
    for (const c of clients) c.send("ping", Date.now());
  }, 15_000);
  setInterval(() => {
    for (const c of clients) {
      if (!agentFor(c.pane)) continue;
      herdr(["agent", "read", c.pane, "--source", "visible", "--format", "ansi"])
        .then((screen) => {
          // A config change gives a new model here, so the page gets it on the next tick.
          const a = agentFor(c.pane);
          const cwd = a?.foreground_cwd || a?.cwd;
          const cfg = loadConfig(config);
          const withBranch = a && cwd && usesBranch(cfg.status) ? { ...a, branch: branches.get(cwd) } : a;
          const json = JSON.stringify(statusBar(String(screen), withBranch ?? null, cfg, homedir()));
          if (json === c.status) return;
          c.status = json;
          c.send("status", JSON.parse(json));
        })
        .catch(() => {});
    }
  }, 1000);
  setInterval(() => {
    config = readConfig(configFile);
    for (const c of clients) sendSettings(c);
    const next = readTheme();
    if (next === theme) return;
    theme = next;
    for (const c of clients) c.send("theme", theme);
  }, 2000);
  await pollAgents();

  const ok = (data: unknown = { ok: true }) => Response.json(data);
  const fail = (e: unknown, status = 400) => Response.json({ error: (e as Error).message ?? String(e) }, { status });

  const listen = (port: number) => Bun.serve({
    hostname: "127.0.0.1",
    port,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if ((url.searchParams.get("t") ?? req.headers.get("x-token")) !== token) return new Response("forbidden", { status: 403 });
      lastActive = Date.now();
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const pane: string = url.searchParams.get("pane") ?? body.pane ?? "";

      switch (`${req.method} ${url.pathname}`) {
        case "GET /":
          return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
        case "GET /health":
          return ok();
        case "GET /theme.css":
          return new Response(theme, { headers: { "content-type": "text/css", "cache-control": "no-store" } });
        case "GET /api/stream": {
          let client!: Client;
          const stream = new ReadableStream({
            start(ctrl) {
              const enc = new TextEncoder();
              client = {
                pane,
                offset: 0,
                seq: 0,
                session: "\0",
                skills: new Map(),
                send: (event, data) => {
                  try {
                    ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                  } catch {
                    clients.delete(client);
                  }
                },
                close: () => ctrl.close(),
              };
              clients.add(client);
              client.send("agents", JSON.parse(agentsJson || "[]"));
              client.send("draft", drafts.get(pane) ?? "");
              sendSettings(client);
              client.send("voice", voiceEvent());
              pump(client).catch(() => {});
            },
            cancel() {
              clients.delete(client);
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
        }
        case "GET /api/screen":
          try {
            const text = await herdr(["agent", "read", pane, "--source", "visible", "--format", "text"]);
            return ok({ text: typeof text === "string" ? text : text?.text ?? text?.read?.text ?? JSON.stringify(text) });
          } catch (e) {
            return fail(e);
          }
        case "POST /api/prompt":
          try {
            if (!String(body.text ?? "").trim()) throw new Error("empty prompt");
            await herdr(["agent", "prompt", pane, String(body.text)]);
            return ok();
          } catch (e) {
            return fail(e);
          }
        case "POST /api/draft":
          drafts.set(pane, String(body.text ?? ""));
          return ok();
        case "POST /api/keys":
          try {
            const keys: string[] = Array.isArray(body.keys) ? body.keys.map(String) : [];
            if (!keys.length) throw new Error("no keys");
            await herdr(["agent", "send-keys", pane, ...keys]);
            return ok();
          } catch (e) {
            return fail(e);
          }
        case "POST /api/voice":
          try {
            await voice(pane, String(body.action));
            return ok();
          } catch (e) {
            sendVoice();
            return fail(e);
          }
        case "POST /api/view":
          try {
            await (body.view === "terminal" ? toTerminal(pane) : toChat(pane));
            return ok();
          } catch (e) {
            return fail(e);
          }
        case "POST /api/terminal":
          try {
            await toTerminal(pane);
            return ok();
          } catch (e) {
            return fail(e);
          }
      }
      return new Response("not found", { status: 404 });
    },
  });
  let server: ReturnType<typeof listen>;
  try {
    server = listen(prev?.port ?? 0);
  } catch {
    server = listen(0);
  }

  function shutdown() {
    server.stop(true);
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  writeFileSync(serverFile, JSON.stringify({ pid: process.pid, port: server.port, token } satisfies ServerInfo), { mode: 0o600 });
  console.error(`herdr-chat listening on 127.0.0.1:${server.port}`);
}

// ---------- main ----------

const commands: Record<string, () => Promise<unknown>> = { toggle, close, serve };
const cmd = commands[process.argv[2] ?? ""];
if (!cmd) {
  console.error("usage: herdr-chat.ts toggle|close|serve");
  process.exit(2);
}
try {
  await cmd();
} catch (e) {
  const msg = (e as Error).message ?? String(e);
  if (process.argv[2] === "serve") throw e;
  await notify("herdr-chat", msg);
  process.exit(1);
}
