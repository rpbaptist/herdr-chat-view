// Read parts of an agent's screen (ANSI text from `herdr agent read`).

const RULE = /^\s*─{10,}\s*$/;
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");

// The agent's footer (status line, mode): the text below the last horizontal rule.
export function footer(screen: string): string[] {
  const lines = screen.split("\n").map((l) => l.replace(/\r/g, ""));
  for (let i = lines.length - 1; i >= 0; i--) {
    if (RULE.test(stripAnsi(lines[i]))) return lines.slice(i + 1).filter((l) => stripAnsi(l).trim()).slice(0, 4);
  }
  return [];
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
