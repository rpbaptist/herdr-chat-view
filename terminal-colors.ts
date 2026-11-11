// The colors of the terminal: foreground, background and ANSI 0 to 15. In a herdr pane, herdr answers with the host terminal colors.
//
//   bun terminal-colors.ts <file>   query the terminal on stdin/stdout and write the colors to <file> as JSON
import { renameSync, writeFileSync } from "node:fs";

export type TerminalColors = { fg: string | null; bg: string | null; ansi: (string | null)[] };

const channel = (h: string) => Math.round((parseInt(h, 16) / (16 ** h.length - 1)) * 255).toString(16).padStart(2, "0");

// "rgb:RRRR/GGGG/BBBB" (1 to 4 hex digits for each channel) or "#rrggbb", as "#rrggbb".
function parseColor(spec: string): string | null {
  const rgb = /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i.exec(spec);
  if (rgb) return `#${rgb.slice(1).map(channel).join("")}`;
  return /^#[0-9a-f]{6}$/i.test(spec) ? spec.toLowerCase() : null;
}

// The OSC 10, 11 and 4 replies in the text. A color without a reply is null.
export function parseReplies(text: string): TerminalColors {
  const colors: TerminalColors = { fg: null, bg: null, ansi: Array(16).fill(null) };
  for (const m of text.matchAll(/\x1b\](10|11|4;(\d+));([^\x07\x1b]*)(?:\x07|\x1b\\)/g)) {
    const color = parseColor(m[3]);
    if (m[1] === "10") colors.fg = color;
    else if (m[1] === "11") colors.bg = color;
    else if (Number(m[2]) < 16) colors.ansi[Number(m[2])] = color;
  }
  return colors;
}

// The DA1 query goes last: every terminal answers it, so its reply ends the wait.
const QUERY = "\x1b]10;?\x1b\\\x1b]11;?\x1b\\" + Array.from({ length: 16 }, (_, i) => `\x1b]4;${i};?\x1b\\`).join("") + "\x1b[c";
const TIMEOUT_MS = 500;

function query(): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    const done = () => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(text);
    };
    const onData = (d: Buffer) => {
      text += d.toString("latin1");
      if (/\x1b\[\?[\d;]*c/.test(text)) done();
    };
    const timer = setTimeout(done, TIMEOUT_MS);
    process.stdin.setRawMode(true);
    process.stdin.on("data", onData);
    process.stdout.write(QUERY);
  });
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file || !process.stdin.isTTY) process.exit(0);
  const colors = parseReplies(await query());
  // A terminal that does not answer keeps the colors of an earlier query.
  if (!colors.fg && !colors.bg && colors.ansi.every((c) => !c)) process.exit(0);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(colors));
  renameSync(tmp, file);
}
