// Read parts of an agent's screen (ANSI text from `herdr agent read`).

const RULE = /^\s*─{10,}\s*$/;
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");

// The mode line, shown as the mode pill. color is an xterm color index.
export type Mode = { label: string; extra: string; color: number | null };
// One segment of the other footer lines. ansi keeps the colors, text is plain.
export type ScreenChip = { type: "screen"; ansi: string; text: string };

const MODE = /mode on|accept edits|bypass permissions|plan mode|manual mode/i;
// Chips are split at wide gaps, or at spaces that sit between color codes.
const CHIP_GAP = /\s{2,}|(?:\x1b\[[0-9;]*m)+\s+(?=\x1b\[)/;

// The agent's footer: the text below the last horizontal rule, as the mode line and the screen chips.
export function footer(screen: string): { mode: Mode | null; chips: ScreenChip[] } {
  const lines = footerLines(screen);
  const modeLine = lines.find((l) => MODE.test(stripAnsi(l)));
  const chips = lines
    .filter((l) => l !== modeLine)
    .flatMap((l) => l.split(CHIP_GAP))
    .map((seg) => ({ type: "screen" as const, ansi: seg.trim(), text: stripAnsi(seg).trim() }))
    .filter((c) => c.text);
  return { mode: modeLine ? parseMode(modeLine) : null, chips };
}

function footerLines(screen: string): string[] {
  const lines = screen.split("\n").map((l) => l.replace(/\r/g, ""));
  const rule = lines.findLastIndex((l) => RULE.test(stripAnsi(l)));
  return rule < 0 ? [] : lines.slice(rule + 1).filter((l) => stripAnsi(l).trim()).slice(0, 4);
}

function parseMode(line: string): Mode {
  const parts = stripAnsi(line).replace(/\(shift\+tab to cycle\)/i, "").split("·").map((t) => t.trim()).filter(Boolean);
  const label = parts.shift()!.replace(/^[^\p{L}]+/u, "").replace(/\s+on$/i, "");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), extra: parts.join(" · "), color: firstColor(line) };
}

function firstColor(line: string): number | null {
  const m = line.match(/\x1b\[(?:[0-9;]*;)?38;5;(\d+)m/);
  if (m) return Number(m[1]);
  const basic = line.match(/\x1b\[(3[0-7]|9[0-7])m/);
  if (!basic) return null;
  const n = Number(basic[1]);
  return n >= 90 ? n - 82 : n - 30;
}

// The text in Claude's input box: the lines between the last two rules.
// "" when the box is empty (it then shows a dim placeholder), null when not found.
export function inputText(screen: string): string | null {
  const raw = screen.split("\n");
  const lines = raw.map((l) => stripAnsi(l).replace(/\s+$/, ""));
  const bottom = lines.findLastIndex((l) => RULE.test(l));
  const top = lines.slice(0, bottom).findLastIndex((l) => RULE.test(l));
  if (top < 0 || !/^[❯>]/.test(lines[top + 1] ?? "")) return null;
  const lead = raw[top + 1].match(/^.*?[❯>][\s ]*((?:\x1b\[[0-9;]*m)*)/)?.[1] ?? "";
  if (/\x1b\[2m/.test(lead)) return "";
  const width = lines[top].trim().length;
  let text = "";
  lines.slice(top + 1, bottom).forEach((l, i) => {
    const part = i === 0 ? l.replace(/^[❯>][\s ]?/, "") : l.replace(/^ {2}/, "");
    const prev = lines[top + i];
    text += i === 0 ? part : (prev.length >= width - 1 ? "" : "\n") + part;
  });
  return text.trim() ? text : "";
}
