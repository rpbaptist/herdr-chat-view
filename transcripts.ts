// Parse agent transcript lines into chat items.

export type Item =
  | { kind: "user" | "assistant" | "note"; id: string; text: string; ts?: string }
  | { kind: "tool_call"; id: string; name: string; input: string; ts?: string }
  | { kind: "tool_result"; id: string; output: string; error: boolean; ts?: string };

export type Parser = (line: any, seq: number) => Item[];

const MAX_TOOL_TEXT = 4000;
const clip = (s: string, n = MAX_TOOL_TEXT) => (s.length > n ? s.slice(0, n) + "\n…" : s);

function toolInput(name: string, input: any): string {
  if (input == null) return "";
  if (typeof input === "string") return clip(input, 600);
  for (const key of ["command", "file_path", "path", "pattern", "url", "query", "description", "prompt"]) {
    if (typeof input[key] === "string") return clip(input[key], 600);
  }
  return clip(JSON.stringify(input), 600);
}

function contentText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : c?.text ?? (c?.type === "image" ? "[image]" : "")))
      .filter(Boolean)
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

const tag = (s: string, name: string) => s.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim();

// Claude Code wraps slash commands, `!` shell input and local output in tags.
function claudeUserText(s: string): { kind: "user" | "note"; text: string } | null {
  const command = tag(s, "command-name");
  if (command) return { kind: "user", text: [command, tag(s, "command-args")].filter(Boolean).join(" ") };
  const bash = tag(s, "bash-input");
  if (bash) return { kind: "user", text: "! " + bash };
  const stdout = tag(s, "bash-stdout") ?? tag(s, "local-command-stdout");
  if (stdout != null) {
    const err = tag(s, "bash-stderr");
    const text = [stdout, err].filter(Boolean).join("\n");
    return text ? { kind: "note", text: clip(text) } : null;
  }
  if (s.startsWith("<")) return null;
  if (s.startsWith("[Request interrupted")) return { kind: "note", text: s };
  return { kind: "user", text: s };
}

export const parseClaude: Parser = (line, seq) => {
  if (line.isSidechain || line.isMeta) return [];
  if (line.type !== "user" && line.type !== "assistant") return [];
  const base = line.uuid ?? `c${seq}`;
  const ts = line.timestamp;
  const content = line.message?.content;
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : [];
  const items: Item[] = [];
  blocks.forEach((b: any, i: number) => {
    const id = `${base}:${i}`;
    if (b.type === "text" && typeof b.text === "string") {
      if (line.type === "assistant") {
        if (b.text.trim()) items.push({ kind: "assistant", id, text: b.text, ts });
      } else {
        const u = claudeUserText(b.text);
        if (u) items.push({ ...u, id, ts });
      }
    } else if (b.type === "tool_use") {
      items.push({ kind: "tool_call", id: b.id, name: b.name, input: toolInput(b.name, b.input), ts });
    } else if (b.type === "tool_result") {
      items.push({ kind: "tool_result", id: b.tool_use_id, output: clip(contentText(b.content)), error: !!b.is_error, ts });
    } else if (b.type === "image" && line.type === "user") {
      items.push({ kind: "user", id, text: "[image]", ts });
    }
  });
  return items;
};

// Codex injects AGENTS.md and environment context as user messages.
const codexNoise = (s: string) => s.startsWith("<") || s.startsWith("# AGENTS.md");

export const parseCodex: Parser = (line, seq) => {
  if (line.type !== "response_item") return [];
  const p = line.payload ?? {};
  const ts = line.timestamp;
  const id = p.id ?? p.call_id ?? `x${seq}`;
  switch (p.type) {
    case "message": {
      if (p.role !== "user" && p.role !== "assistant") return [];
      const text = (p.content ?? [])
        .map((c: any) => c?.text ?? "")
        .filter((t: string) => t && !(p.role === "user" && codexNoise(t)))
        .join("\n");
      return text.trim() ? [{ kind: p.role, id: `${id}:${seq}`, text, ts }] : [];
    }
    case "function_call":
    case "custom_tool_call":
    case "local_shell_call": {
      let input = p.input ?? p.arguments ?? p.action;
      if (typeof input === "string") {
        try {
          input = JSON.parse(input);
        } catch {}
      }
      return [{ kind: "tool_call", id: p.call_id ?? id, name: p.name ?? p.type, input: toolInput(p.name, input), ts }];
    }
    case "function_call_output":
    case "custom_tool_call_output": {
      const out = typeof p.output === "string" ? p.output : contentText(p.output?.content ?? p.output);
      return [{ kind: "tool_result", id: p.call_id ?? id, output: clip(out), error: false, ts }];
    }
  }
  return [];
};

// ---------- skill lists ----------

export type Skill = { name: string; description: string };
export type SkillParser = (lines: any[]) => Skill[];

// Add skills to a list by name. A skill with no description does not replace
// one that has a description. Return true when the list changed.
export function addSkills(known: Map<string, Skill>, found: Iterable<Skill>): boolean {
  let changed = false;
  for (const s of found) {
    const prev = known.get(s.name);
    if (prev && (prev.description === s.description || !s.description)) continue;
    known.set(s.name, s);
    changed = true;
  }
  return changed;
}

// "- name: description". Plugin names have a colon too, but no space after it.
const SKILL_LINE = /^- (\S+?)(?::\s+(.*?))?\s*$/;

// Claude Code lists skills in `skill_listing` attachments: the first one has all
// skills, later ones (`isInitial: false`) add new ones.
export const claudeSkills: SkillParser = (lines) => {
  const skills: Skill[] = [];
  for (const line of lines) {
    const a = line?.attachment;
    if (line?.isSidechain || a?.type !== "skill_listing") continue;
    const descriptions = new Map<string, string>();
    for (const l of String(a.content ?? "").split("\n")) {
      const m = l.match(SKILL_LINE);
      if (m) descriptions.set(m[1], m[2] ?? "");
    }
    const names: unknown[] = Array.isArray(a.names) ? a.names : [...descriptions.keys()];
    for (const name of names) if (typeof name === "string") skills.push({ name, description: descriptions.get(name) ?? "" });
  }
  return skills;
};

// Codex lists skills in a developer message, under "### Available skills", as
// "- name: description (file: path)" lines.
export const codexSkills: SkillParser = (lines) => {
  const skills: Skill[] = [];
  for (const line of lines) {
    const p = line?.payload;
    if (line?.type !== "response_item" || p?.type !== "message") continue;
    for (const c of p.content ?? []) {
      const text = String(c?.text ?? "").split("\n");
      const start = text.indexOf("### Available skills");
      if (start < 0) continue;
      for (const l of text.slice(start + 1)) {
        if (!l.trim() && !skills.length) continue;
        const m = l.replace(/\s*\(file: [^)]*\)\s*$/, "").match(SKILL_LINE);
        if (!m) break;
        skills.push({ name: m[1], description: m[2] ?? "" });
      }
    }
  }
  return skills;
};
