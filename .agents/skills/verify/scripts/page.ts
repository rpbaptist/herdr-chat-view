// Drive the chat page of a verification instance in headless Chromium.
//   bun page.ts <run-dir> <journey.ts> [args...]
//
// A journey file exports `default async (j: Journey) => void`. Throw to fail.
// Evidence goes to <run-dir>/<journey-name>/: numbered screenshots, console.log,
// steps.log. The page is the same URL the chat pane loads in pixel.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";

export type Run = Record<string, string>;
export type Journey = {
  page: Page;
  run: Run;
  args: string[];
  out: string;
  /** Save a numbered full-page screenshot. */
  shot: (name: string) => Promise<string>;
  /** Write a line to steps.log and stdout. */
  step: (msg: string) => void;
  /** Run a herdr CLI command against this run's session; returns parsed JSON or text. */
  herdr: (...args: string[]) => any;
  /** Visible text of the fixture agent pane. */
  agentScreen: () => string;
  /** Current transcript lines, parsed. */
  transcript: () => any[];
  /** Poll until fn returns truthy, or throw after timeoutMs. */
  until: <T>(what: string, fn: () => T | Promise<T>, timeoutMs?: number) => Promise<T>;
};

const [dirArg, journeyArg, ...args] = process.argv.slice(2);
if (!dirArg || !journeyArg) {
  console.error("usage: bun page.ts <run-dir> <journey.ts> [args...]");
  process.exit(2);
}
const dir = resolve(dirArg);
const run: Run = Object.fromEntries(
  readFileSync(join(dir, "run.env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const name = basename(journeyArg).replace(/\.ts$/, "");
const out = join(dir, name);
mkdirSync(out, { recursive: true });

const env = { ...process.env, HERDR_SOCKET_PATH: run.HERDR_SOCKET_PATH } as Record<string, string>;
delete env.HERDR_PANE_ID;
function herdr(...a: string[]) {
  const p = Bun.spawnSync(["herdr", ...a], { env, stdout: "pipe", stderr: "pipe" });
  const text = p.stdout.toString();
  if (p.exitCode !== 0) throw new Error(`herdr ${a.join(" ")}: ${p.stderr.toString() || text}`);
  try {
    const j = JSON.parse(text);
    return j.result ?? j;
  } catch {
    return text;
  }
}

let n = 0;
const step = (msg: string) => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(join(out, "steps.log"), line + "\n");
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
page.on("console", (m) => appendFileSync(join(out, "console.log"), `${m.type()}: ${m.text()}\n`));
page.on("pageerror", (e) => appendFileSync(join(out, "console.log"), `pageerror: ${e.message}\n`));

const j: Journey = {
  page,
  run,
  args,
  out,
  step,
  herdr,
  async shot(label) {
    const file = join(out, `${String(++n).padStart(2, "0")}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    step(`screenshot ${file}`);
    return file;
  },
  agentScreen: () => {
    const r = herdr("agent", "read", run.AGENT_PANE, "--source", "visible", "--format", "text");
    return typeof r === "string" ? r : r?.read?.text ?? r?.text ?? JSON.stringify(r);
  },
  transcript: () => readFileSync(run.TRANSCRIPT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
  async until(what, fn, timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timeout: ${what}`);
      await Bun.sleep(200);
    }
  },
};

let code = 0;
try {
  step(`open ${run.URL.replace(/t=[0-9a-f]+/, "t=…")}`);
  await page.goto(run.URL);
  const mod = await import(resolve(journeyArg));
  await mod.default(j);
  step("PASS");
} catch (e) {
  code = 1;
  step(`FAIL ${(e as Error).message}`);
  await j.shot("failure").catch(() => {});
} finally {
  await browser.close();
}
process.exit(code);
