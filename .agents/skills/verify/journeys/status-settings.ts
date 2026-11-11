// Feature: status-settings. The gear under the composer opens a popover that edits [status] of config.toml.
// Proves: click or key in the popover -> POST /api/config (one key) -> config.toml text (comment and other
// table kept) -> status bar under the composer; the quick hide of a chip, which stays hidden when its number
// changes; a refused bad regex that keeps the user's text and the file; a config error that blocks writes;
// and that the popover keys do not reach the agent.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Journey } from "../scripts/page.ts";

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const file = run.HERDR_CHAT_CONFIG;
  if (!file) throw new Error("run.env has no HERDR_CHAT_CONFIG; start the run with this checkout's up.sh");
  const fileText = () => (existsSync(file) ? readFileSync(file, "utf8") : "");
  const withStatus = (lines: string) => `# my settings\n[status]\n${lines}\n\n[input]\nsend_key = "enter"\n`;
  const chips = () => page.locator("#status .seg").allInnerTexts();
  const pop = page.locator("#settings");
  const at = (id: string) => pop.locator(`[data-id="${id}"]`);
  // After each step: the status bar in the page and the exact text of config.toml.
  async function expectState(what: string, want: string[], text: string) {
    await until(`${what}: chips ${JSON.stringify(want)}`, async () => JSON.stringify(await chips()) === JSON.stringify(want));
    await until(`${what}: config.toml`, () => fileText() === text).catch(() => {
      throw new Error(`${what}: config.toml is\n${fileText()}\nwant\n${text}`);
    });
    step(`${what}: chips ${JSON.stringify(want)}; config.toml:\n${fileText()}`);
  }
  const agentMode = () => /^mode: (\d)/m.exec(j.agentScreen())?.[1];
  const focusInPopover = () => page.evaluate(() => !!document.activeElement?.closest("#settings"));
  const sendMessage = async (text: string) => {
    await page.locator("#input").fill(text);
    await page.locator("#input").press("Enter");
    await until(`agent got "${text}"`, () => j.agentScreen().includes(`last: ${text}`));
  };

  const seed = withStatus("mode = true # keep");
  const all = ["fixture-agent · verify", "⎇ main", "42% context"];
  try {
    writeFileSync(file, seed);
    await page.evaluate(() => ((window as any).__noReload = true));
    await expectState("seed file", all, seed);
    for (let m = agentMode(); m !== "1"; m = agentMode()) {
      await page.locator("#input").focus();
      await page.keyboard.press("Shift+Tab");
      await until("agent mode changes", () => agentMode() !== m);
    }
    await until("mode pill shows", () => page.locator("#mode.on").count());

    await page.locator("#gear").click();
    await until("popover open", () => pop.isVisible());
    if (!(await focusInPopover())) throw new Error("the focus is not in the popover after it opens");
    if ((await page.locator("#gear").getAttribute("aria-expanded")) !== "true") throw new Error("gear aria-expanded is not true");
    await j.shot("open");

    const before = j.transcript().length;
    await page.keyboard.press("Shift+Tab");
    await at("hide:new").focus();
    await page.keyboard.press("Enter");
    await Bun.sleep(1200);
    if (agentMode() !== "1") throw new Error(`Shift+Tab in the popover reached the agent: mode ${agentMode()}`);
    if (j.transcript().length !== before) throw new Error("Enter in the popover sent a message");
    if (!(await pop.isVisible()) || !(await focusInPopover())) throw new Error("Shift+Tab or Enter closed the popover or moved the focus out");
    if (fileText() !== seed) throw new Error("Enter in an empty field wrote the file");
    step("Shift+Tab and Enter in the popover: agent mode stays 1, no message, no write");

    await at("mode").focus();
    await page.keyboard.press("Space");
    await until("mode pill hidden", async () => !(await page.locator("#mode.on").count()));
    await expectState("mode pill off by keyboard", all, withStatus("mode = false # keep"));
    await at("mode").click();
    await until("mode pill shows again", () => page.locator("#mode.on").count());
    await expectState("mode pill on by click", all, seed);

    await at("add:kind").click();
    await expectState("built-in kind added", [...all, "claude"], withStatus('mode = true # keep\nitems = ["*", "kind"]'));
    await at("items:1:up").click();
    await expectState("kind moved up", ["claude", ...all], withStatus('mode = true # keep\nitems = ["kind", "*"]'));
    if ((await page.evaluate(() => document.activeElement?.getAttribute("data-id"))) !== "items:0:down")
      throw new Error("the focus did not follow the moved item");

    await at("items:new").fill("/^⎇/");
    await at("items:new").press("Enter");
    await expectState("regex item added", ["claude", ...all], withStatus('mode = true # keep\nitems = ["kind", "*", "/^⎇/"]'));
    await at("items:2:up").focus();
    await page.keyboard.press("Enter");
    const ordered = ["claude", "⎇ main", "fixture-agent · verify", "42% context"];
    await expectState("regex item moved up by keyboard", ordered, withStatus('mode = true # keep\nitems = ["kind", "/^⎇/", "*"]'));
    await j.shot("items");

    await pop.getByRole("button", { name: "Hide 42% context" }).click();
    const quick = withStatus('mode = true # keep\nitems = ["kind", "/^⎇/", "*"]\nhide = ["/^\\\\d+% context$/"]');
    await expectState("quick hide of 42% context", ordered.slice(0, 3), quick);
    const shown = await at("hide:0").inputValue();
    if (shown !== "/^\\d+% context$/") throw new Error(`the added regex shows as ${shown}`);
    if ((await page.evaluate(() => document.activeElement?.getAttribute("data-id"))) !== "hide:0") throw new Error("the added regex has no focus");
    if (!(await pop.locator(".note code").innerText()).includes("\\d+% context")) throw new Error("no note shows the added regex");
    step(`quick hide added ${shown}, focused for an edit`);
    await j.shot("quick-hide");

    await page.locator("#gear").click();
    await until("popover closed by the gear", async () => !(await pop.isVisible()));
    await sendMessage("context 43");
    await until("agent footer shows 43% context", () => j.agentScreen().includes("43% context"));
    await Bun.sleep(2500);
    if (JSON.stringify(await chips()) !== JSON.stringify(ordered.slice(0, 3))) throw new Error(`43% context shows: ${await chips()}`);
    step("the agent footer changed to 43% context and the chip stays hidden");
    await page.locator("#gear").click();
    await until("popover open again", () => pop.isVisible());

    await at("hide:0").fill("/^\\d+% (context|ctx)$/");
    await at("hide:0").press("Enter");
    const edited = withStatus('mode = true # keep\nitems = ["kind", "/^⎇/", "*"]\nhide = ["/^\\\\d+% (context|ctx)$/"]');
    await expectState("hide regex edited", ordered.slice(0, 3), edited);
    await at("hide:0").fill("/^\\d+% (ctx)$/");
    await at("hide:0").press("Enter");
    await expectState("hide regex edited so it no longer matches", [...ordered.slice(0, 3), "43% context"],
      withStatus('mode = true # keep\nitems = ["kind", "/^⎇/", "*"]\nhide = ["/^\\\\d+% (ctx)$/"]'));
    await at("hide:0").fill("/^\\d+% (context|ctx)$/");
    await at("hide:0").press("Enter");
    await expectState("hide regex edited back", ordered.slice(0, 3), edited);

    await at("hide:new").fill("/(oops/");
    await at("hide:new").press("Enter");
    const err = await until("server error under the field", async () => (await pop.locator(".ferr").allInnerTexts()).join(" "));
    if (!/status\.hide\[1\]/.test(err)) throw new Error(`unexpected error text: ${err}`);
    if ((await at("hide:new").inputValue()) !== "/(oops/") throw new Error("the bad regex text is gone from the field");
    if (!(await pop.isVisible())) throw new Error("the popover closed on a refused value");
    await Bun.sleep(500);
    if (fileText() !== edited) throw new Error(`a refused value changed the file:\n${fileText()}`);
    step(`bad regex refused: ${err}; the field keeps "/(oops/"; the file is unchanged`);
    await j.shot("bad-regex");

    await at("items:0:remove").click();
    await expectState("kind removed", ["⎇ main", "fixture-agent · verify"], withStatus('mode = true # keep\nitems = ["/^⎇/", "*"]\nhide = ["/^\\\\d+% (context|ctx)$/"]'));
    await at("items:1:remove").click();
    await expectState('"*" removed: only the listed items show', ["⎇ main"], withStatus('mode = true # keep\nitems = ["/^⎇/"]\nhide = ["/^\\\\d+% (context|ctx)$/"]'));
    await at("add:*").click();
    const final = withStatus('mode = true # keep\nitems = ["/^⎇/", "*"]\nhide = ["/^\\\\d+% (context|ctx)$/"]');
    await expectState('"*" added back', ["⎇ main", "fixture-agent · verify"], final);

    j.herdr("pane", "send-text", run.AGENT_PANE, "keepme");
    await until("agent input box has text", () => j.agentScreen().includes("❯ keepme"));
    await at("hide:0").focus();
    await page.keyboard.press("Escape");
    await until("Esc closes the popover", async () => !(await pop.isVisible()));
    if ((await page.evaluate(() => document.activeElement?.id)) !== "input") throw new Error("Esc did not return the focus to the composer");
    await Bun.sleep(1000);
    if (!j.agentScreen().includes("❯ keepme")) throw new Error("Esc in the popover reached the agent");
    step("Esc closed the popover, the focus is in the composer, and the agent input box still has its text");
    j.herdr("agent", "send-keys", run.AGENT_PANE, "esc");

    await page.locator("#gear").click();
    await until("popover open", () => pop.isVisible());
    await page.locator("#log").click({ position: { x: 20, y: 20 } });
    await until("a click outside closes the popover", async () => !(await pop.isVisible()));
    if ((await page.evaluate(() => document.activeElement?.id)) !== "input") throw new Error("a click outside did not return the focus to the composer");
    step("a click outside closed the popover and the focus is in the composer");

    await page.locator("#gear").click();
    const broken = final.replace('items = ["/^⎇/", "*"]', 'items = ["/^⎇/", "brnch"]');
    writeFileSync(file, broken);
    await until("popover shows the config error", () => pop.locator(".perr").count());
    const perr = await pop.locator(".perr").innerText();
    if (!/unknown item "brnch"/.test(perr)) throw new Error(`unexpected config error: ${perr}`);
    const controls = await pop.locator("input, button").evaluateAll((els) => els.map((el) => el.getAttribute("data-id")));
    if (JSON.stringify(controls) !== '["close"]') throw new Error(`the popover has edit controls while the file has an error: ${controls}`);
    await j.shot("config-error");
    await at("close").click();
    if (fileText() !== broken) throw new Error("the popover wrote a file that has an error");
    step(`config error shows in the popover with no edit controls, the file is not written: ${perr}`);
    writeFileSync(file, final);
    await expectState("file fixed by hand", ["⎇ main", "fixture-agent · verify"], final);

    for (const theme of ["dark", "light"] as const) {
      await page.locator("#gear").click();
      await until("popover open", () => pop.isVisible());
      await at(`theme:${theme}`).click();
      await until(`${theme} theme`, async () => (await at(`theme:${theme}`).getAttribute("aria-pressed")) === "true");
      await pop.getByRole("button", { name: "Hide fixture-agent · verify" }).focus();
      await j.shot(`popover-${theme}`);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 500, height: 900 });
    await page.locator("#gear").click();
    const box = await pop.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > 500) throw new Error(`the popover does not fit a 500 px pane: ${JSON.stringify(box)}`);
    const overflow = await pop.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (overflow > 0) throw new Error(`the popover scrolls sideways by ${overflow}px at 500 px`);
    await j.shot("narrow-light");
    await page.keyboard.press("Escape");

    const size = () => pop.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.locator("#gear").click();
    const small = await size();
    writeFileSync(file, `${fileText()}\n[font]\nsize = 19\nmono_size = 17\n`);
    await until("the popover text scales with [font] size", async () => (await size()) > small);
    step(`popover font size ${small}px -> ${await size()}px with [font] size = 19`);
    const big = await pop.boundingBox();
    if (!big || big.x < 0 || big.x + big.width > 500) throw new Error(`the large popover does not fit a 500 px pane: ${JSON.stringify(big)}`);
    await j.shot("narrow-large-font");
    await page.keyboard.press("Escape");

    const text = fileText();
    if (!text.startsWith("# my settings\n[status]\nmode = true # keep\n") || !text.includes('[input]\nsend_key = "enter"\n'))
      throw new Error(`the comment or the [input] table is lost:\n${text}`);
    if (!(await page.evaluate(() => (window as any).__noReload))) throw new Error("the page reloaded");
    step("the comment and the [input] table survived; no page reload");
  } finally {
    await sendMessage("context 42").catch(() => {});
    for (let m = agentMode(); m && m !== "0"; m = agentMode()) {
      j.herdr("agent", "send-keys", run.AGENT_PANE, "shift+tab");
      await until("agent mode changes", () => agentMode() !== m).catch(() => {});
    }
    rmSync(file, { force: true });
  }
}
