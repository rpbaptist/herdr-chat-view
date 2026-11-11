// Feature: status-bar. config.toml hides, moves and adds status bar chips, live.
// Proves: config file -> server timer -> status bar model -> status event -> page render,
// with no page reload, and a config error that shows in #err and falls back to the defaults.
import { rmSync, writeFileSync } from "node:fs";
import type { Journey } from "../scripts/page.ts";

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const file = run.HERDR_CHAT_CONFIG;
  if (!file) throw new Error("run.env has no HERDR_CHAT_CONFIG; start the run with this checkout's up.sh");
  const chips = () => page.locator("#status .seg").allInnerTexts();
  const waitChips = (want: string[]) =>
    until(`chips ${JSON.stringify(want)}`, async () => JSON.stringify(await chips()) === JSON.stringify(want));
  const write = (text: string) => {
    step(`write config.toml:\n${text}`);
    writeFileSync(file, text);
  };

  try {
    rmSync(file, { force: true });
    step("no config: the status bar shows the agent's chips in the agent's order");
    await waitChips(["fixture-agent · verify", "⎇ main", "42% context"]);
    await page.evaluate(() => ((window as any).__noReload = true));
    await j.shot("default");

    write('[status]\nhide = ["/\\\\d+% context/"]\nitems = ["kind", "/^⎇/", "*"]\n');
    await waitChips(["claude", "⎇ main", "fixture-agent · verify"]);
    if (!(await page.locator("#status .seg.builtin.kind").count())) throw new Error("kind chip is not a built-in item");
    step("context chip hidden, branch chip moved, kind built-in item added");
    await j.shot("configured");

    write('[status]\nitems = ["/^⎇/", "brnch"]\n');
    const err = await until("config error in #err", async () => (await page.locator("#err").textContent())?.trim());
    if (!/unknown item "brnch"/.test(err)) throw new Error(`unexpected error text: ${err}`);
    await waitChips(["fixture-agent · verify", "⎇ main", "42% context"]);
    step(`error shows and the defaults apply: ${err}`);
    await j.shot("error");

    write('[status]\nitems = ["status", "*"]\n');
    await waitChips(["idle", "fixture-agent · verify", "⎇ main", "42% context"]);
    await until("error cleared", async () => !(await page.locator("#err").textContent())?.trim());
    const color = await page.locator("#status .seg.builtin.status").evaluate((el) => getComputedStyle(el).color);
    const idle = await page.locator("#hdot").evaluate((el) => getComputedStyle(el).backgroundColor);
    if (color !== idle) throw new Error(`status chip color ${color} is not the header idle color ${idle}`);
    step(`error cleared; status chip in the herdr state color ${color}`);
    await j.shot("fixed");

    if (!(await page.evaluate(() => (window as any).__noReload))) throw new Error("the page reloaded");
    step("all changes showed with no page reload");
  } finally {
    rmSync(file, { force: true });
  }
}
