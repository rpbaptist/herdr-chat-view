// Feature: voice. The microphone button dictates into the message box through the
// system tool. up.sh gives the server a fake voxtype (<run-dir>/voxtype), so no
// microphone records. Proves: button -> /api/voice -> tool calls -> status polls ->
// page states -> text in the message box, Esc cancels, tool errors show, [voice] tool = "off".
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey } from "../scripts/page.ts";

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const fake = run.FAKE_VOXTYPE_DIR;
  const file = run.HERDR_CHAT_CONFIG;
  if (!fake || !file) throw new Error("run.env has no FAKE_VOXTYPE_DIR; start the run with this checkout's up.sh");
  const input = page.locator("#input");
  const mic = page.locator("#mic");
  const calls = () => (existsSync(join(fake, "calls.log")) ? readFileSync(join(fake, "calls.log"), "utf8").split("\n").filter(Boolean) : []);
  const records = () => calls().filter((c) => c.startsWith("record"));
  const cls = async () => (await mic.getAttribute("class")) ?? "";
  const focused = () => page.evaluate(() => document.activeElement?.id);
  const voiceFiles = () => readdirSync(run.STATE_DIR).filter((f) => f.startsWith("voice-"));
  const sentKeys: string[][] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/keys")) sentKeys.push(JSON.parse(r.postData() ?? "{}").keys ?? []);
  });

  try {
    rmSync(file, { force: true });
    rmSync(join(fake, "fail"), { force: true });
    writeFileSync(join(fake, "text"), "and fix the flaky test");
    await page.locator("#items .msg.user", { hasText: "Fixture question" }).waitFor();
    await page.evaluate(() => ((window as any).__noReload = true));

    step("idle: the button shows, enabled, with the tool in the tooltip");
    await until("mic visible", () => mic.isVisible());
    if (await mic.isDisabled()) throw new Error("mic is disabled");
    if ((await mic.getAttribute("title")) !== "Dictate (voxtype)") throw new Error(`mic title ${await mic.getAttribute("title")}`);
    await input.fill("Please look");
    await j.shot("idle");

    step("click: the tool starts recording into a file, the focus stays in the message box");
    await mic.click();
    await until("mic shows recording", async () => (await cls()).includes("rec"));
    if (!records().at(-1)?.startsWith(`record start --file=${run.STATE_DIR}/voice-`)) throw new Error(`calls: ${calls()}`);
    if ((await focused()) !== "input") throw new Error(`focus is on ${await focused()}`);
    step(`tool calls: ${JSON.stringify(calls())}`);
    await j.shot("recording");

    step("click again: the tool stops and transcribes");
    await mic.click();
    await until("mic shows transcribing", async () => (await cls()).includes("busy"));
    if (records().at(-1) !== "record stop") throw new Error(`calls: ${calls()}`);
    if (!(await mic.getAttribute("title"))?.startsWith("Transcribing")) throw new Error("no transcribing tooltip");
    await j.shot("transcribing");

    step("the text comes after the draft, the button is idle, the text file is gone");
    await until("dictated text in the message box", async () => (await input.inputValue()) === "Please look and fix the flaky test", 15_000);
    await until("mic idle", async () => !/rec|busy/.test(await cls()));
    if (await mic.locator(".vs").textContent()) throw new Error("the spinner stays after transcribing");
    if ((await focused()) !== "input") throw new Error(`focus is on ${await focused()}`);
    if (voiceFiles().length) throw new Error(`text files left: ${voiceFiles()}`);
    await j.shot("text-in-box");

    step("Esc while recording cancels the dictation and does not interrupt the agent");
    await mic.click();
    await until("mic shows recording", async () => (await cls()).includes("rec"));
    await input.press("Escape");
    await until("mic idle after Esc", async () => !/rec|busy/.test(await cls()));
    if (records().at(-1) !== "record cancel") throw new Error(`calls: ${calls()}`);
    if (sentKeys.length) throw new Error(`keys reached the agent: ${JSON.stringify(sentKeys)}`);
    if ((await input.inputValue()) !== "Please look and fix the flaky test") throw new Error("cancel changed the draft");
    await j.shot("cancelled");

    step("Esc with no dictation still interrupts the agent");
    await input.press("Escape");
    await until("esc sent to the agent", () => sentKeys.some((k) => k[0] === "esc"));

    step("a tool error shows in the error line, and the button stays idle");
    writeFileSync(join(fake, "fail"), "Error: voxtype daemon is not running");
    await mic.click();
    const err = await until("error in #err", async () => (await page.locator("#err").textContent())?.trim());
    if (err !== "Error: voxtype daemon is not running") throw new Error(`#err is ${err}`);
    if (/rec|busy/.test(await cls())) throw new Error("mic not idle after the error");
    await j.shot("error");
    rmSync(join(fake, "fail"));

    step('[voice] tool = "off" hides the button, with no page reload');
    writeFileSync(file, '[voice]\ntool = "off"\n');
    await until("mic hidden", async () => !(await mic.isVisible()));
    await j.shot("off");
    rmSync(file);
    await until("mic visible again", () => mic.isVisible());

    if (!(await page.evaluate(() => (window as any).__noReload))) throw new Error("the page reloaded");
    step(`all tool calls: ${JSON.stringify(calls())}`);
  } finally {
    rmSync(file, { force: true });
    rmSync(join(fake, "fail"), { force: true });
    await input.fill("").catch(() => {});
  }
}
