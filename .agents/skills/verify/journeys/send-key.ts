// Feature: send-key. [input] send_key in config.toml picks Enter or Ctrl+Enter to send.
// Proves: config file -> server timer -> settings event -> page key handling and tooltip,
// with real key presses, no page reload, and the default (no config) sending on Enter.
import { rmSync, writeFileSync } from "node:fs";
import type { Journey } from "../scripts/page.ts";

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const file = run.HERDR_CHAT_CONFIG;
  if (!file) throw new Error("run.env has no HERDR_CHAT_CONFIG; start the run with this checkout's up.sh");
  const input = page.locator("#input");
  const write = (text: string) => {
    step(`write config.toml:\n${text}`);
    writeFileSync(file, text);
  };
  const waitTip = (want: string) => until(`send tooltip ${want}`, async () => (await page.locator("#send").getAttribute("title")) === want);
  const userEntries = (text: string) =>
    j.transcript().filter((l) => l.type === "user" && JSON.stringify(l.message.content).includes(text)).length;
  const noSend = async (what: string, text: string) => {
    await page.waitForTimeout(1500);
    if (userEntries(text)) throw new Error(`${what}: the message was sent`);
  };
  const sentKeys: string[][] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/keys")) sentKeys.push(JSON.parse(r.postData() ?? "{}").keys ?? []);
  });

  try {
    rmSync(file, { force: true });
    await page.locator("#items .msg.user", { hasText: "Fixture question" }).waitFor();
    await page.evaluate(() => ((window as any).__noReload = true));

    const t1 = `default ${Date.now()}`;
    step("no config: Enter sends");
    await waitTip("Send (Enter)");
    await input.fill(t1);
    await input.press("Enter");
    await page.locator("#items .msg.assistant", { hasText: `echo: ${t1}` }).waitFor({ timeout: 10_000 });
    await until("agent pane shows the prompt", () => j.agentScreen().includes(`last: ${t1}`));
    await j.shot("default-sent");

    write('[input]\nsend_key = "ctrl-enter"\n');
    await waitTip("Send (Ctrl+Enter)");
    const t2 = `ctrl ${Date.now()}`;
    step("ctrl-enter mode: Enter and Shift+Enter add new lines and send nothing");
    await input.fill("");
    await input.pressSequentially(`${t2} one`);
    await input.press("Enter");
    await input.pressSequentially("two");
    await input.press("Shift+Enter");
    await input.pressSequentially("three");
    if ((await input.inputValue()) !== `${t2} one\ntwo\nthree`) throw new Error(`composer is ${JSON.stringify(await input.inputValue())}`);
    await noSend("Enter and Shift+Enter", t2);
    await j.shot("ctrl-newlines");

    step("Ctrl+Enter sends the three lines");
    await input.press("Control+Enter");
    await page.locator("#items .msg.assistant", { hasText: `echo: ${t2} one` }).waitFor({ timeout: 10_000 });
    await until("transcript has the three lines", () => userEntries(`${t2} one\\ntwo\\nthree`) === 1);
    if ((await input.inputValue()) !== "") throw new Error("composer not cleared after Ctrl+Enter");
    await j.shot("ctrl-sent");

    step("ctrl-enter mode: the popup still takes Enter and Tab, and sends nothing");
    await input.fill("");
    await input.pressSequentially("/comp");
    await page.locator("#complete .opt .nm", { hasText: /^\/compact$/ }).waitFor({ timeout: 5_000 });
    const before = j.transcript().length;
    await input.press("Enter");
    if ((await input.inputValue()) !== "/compact ") throw new Error(`Enter in the popup gave ${JSON.stringify(await input.inputValue())}`);
    await input.fill("");
    await input.pressSequentially("/comp");
    await page.locator("#complete .opt.on").waitFor();
    await input.press("Tab");
    if ((await input.inputValue()) !== "/compact ") throw new Error(`Tab in the popup gave ${JSON.stringify(await input.inputValue())}`);
    await page.waitForTimeout(1000);
    if (j.transcript().length !== before) throw new Error("the popup keys sent a message");
    await j.shot("ctrl-popup");
    await input.fill("");

    write('[input]\nsend_key = "nope"\n');
    const err = await until("config error in #err", async () => (await page.locator("#err").textContent())?.trim());
    if (!/input\.send_key must be/.test(err)) throw new Error(`unexpected error text: ${err}`);
    await waitTip("Send (Enter)");
    step(`error shows and Enter is the send key again: ${err}`);
    await j.shot("error");

    write('[input]\nsend_key = "enter"\n');
    await until("error cleared", async () => !(await page.locator("#err").textContent())?.trim());
    const t3 = `back ${Date.now()}`;
    await input.fill(t3);
    await input.press("Enter");
    await page.locator("#items .msg.assistant", { hasText: `echo: ${t3}` }).waitFor({ timeout: 10_000 });
    step("send_key = enter: Enter sends again");
    await j.shot("enter-again");

    if (sentKeys.length) throw new Error(`keys reached the agent: ${JSON.stringify(sentKeys)}`);
    if (!(await page.evaluate(() => (window as any).__noReload))) throw new Error("the page reloaded");
    step("all changes showed with no page reload");
  } finally {
    rmSync(file, { force: true });
  }
}
