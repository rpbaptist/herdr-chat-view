// Set one key of one table in config.toml text. Everything else in the file stays as it is.
export type Value = string | boolean | number | string[];

const NAME = /^[A-Za-z0-9_-]+$/;

function render(value: Value): string {
  if (typeof value === "string") return JSON.stringify(value).replace(/\x7f/g, "\\u007f");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("number must be finite");
    return String(value);
  }
  if (typeof value === "boolean") return String(value);
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new Error("value must be a string, boolean, number or list of strings");
  return `[${value.map(render).join(", ")}]`;
}

// Where a value ends: it can span lines (an array, a multi-line string). The comment after it, if any.
function valueEnd(lines: string[], from: number, col: number): { end: number; comment: string } {
  let depth = 0, str: string | null = null;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i];
    let comment = "";
    for (let c = i === from ? col : 0; c < line.length; ) {
      if (str) {
        if (line.startsWith(str, c)) { c += str.length; str = null; }
        else c += line[c] === "\\" && str[0] === '"' ? 2 : 1;
        continue;
      }
      const ch = line[c];
      if (ch === "#") { comment = line.slice(c); break; }
      if (ch === '"' || ch === "'") { str = line.startsWith(ch.repeat(3), c) ? ch.repeat(3) : ch; c += str.length; continue; }
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
      c++;
    }
    if (str?.length === 1) str = null;
    if (depth <= 0 && !str) return { end: i, comment };
  }
  return { end: lines.length - 1, comment: "" };
}

type Statement = { start: number; end: number; header?: string; key?: string; comment: string };

function statements(lines: string[]): Statement[] {
  const out: Statement[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t[0] === "#") continue;
    if (t[0] === "[") {
      const m = /^\[([^[\]]*)\]\s*(#.*)?$/.exec(t);
      out.push({ start: i, end: i, header: m ? m[1].replace(/\s+/g, "") : t, comment: "" });
      continue;
    }
    const m = /^("[^"]*"|'[^']*'|[\w.-]+)\s*=/.exec(t);
    if (!m) { out.push({ start: i, end: i, comment: "" }); continue; }
    const col = lines[i].indexOf("=", lines[i].indexOf(m[1])) + 1;
    const { end, comment } = valueEnd(lines, i, col);
    out.push({ start: i, end, key: m[1].replace(/^(["'])(.*)\1$/, "$2"), comment });
    i = end;
  }
  return out;
}

export function setKey(text: string, table: string, key: string, value: Value): string {
  if (!NAME.test(table) || !NAME.test(key)) throw new Error("bad table or key name");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text === "" ? [] : text.split(/\r?\n/);
  let final = text === "" || text.endsWith("\n");
  if (text.endsWith("\n")) lines.pop();
  let inTable = false, last: Statement | null = null, found: Statement | null = null;
  for (const s of statements(lines)) {
    if (s.header !== undefined) {
      if (inTable) break;
      inTable = s.header === table;
      if (inTable) last = s;
    } else if (inTable) {
      last = s;
      if (s.key === key) found = s;
    }
  }
  const entry = `${key} = ${render(value)}`;
  if (found) {
    const indent = /^\s*/.exec(lines[found.start])![0];
    lines.splice(found.start, found.end - found.start + 1, `${indent}${entry}${found.comment ? ` ${found.comment}` : ""}`);
  } else if (last) {
    final ||= last.end === lines.length - 1;
    lines.splice(last.end + 1, 0, entry);
  } else {
    final = true;
    if (lines.length && lines.at(-1)!.trim()) lines.push("");
    lines.push(`[${table}]`, entry);
  }
  return lines.join(eol) + (final ? eol : "");
}
