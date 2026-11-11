// Feature: theme. The Auto / Dark / Light control in the settings popover (the gear), and [theme] mode in config.toml.
// Proves: click or key -> POST /api/config -> config.toml text (other content kept) -> settings and theme
// events -> computed colors of every open page; a hand edit of the file; and a reload that keeps the choice.
// The herdr config and the terminal colors file are fixtures in the run directory: herdr colors first, terminal colors second.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey } from "../scripts/page.ts";

const BUILTIN = { dark: "#262624", light: "#faf9f5" };
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const TERMINAL = { fg: "#d0d0d0", bg: "#101418", ansi: Array.from({ length: 16 }, (_, i) => `#20${(i * 16).toString(16).padStart(2, "0")}40`) };

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const file = run.HERDR_CHAT_CONFIG;
  if (!file) throw new Error("run.env has no HERDR_CHAT_CONFIG; start the run with this checkout's up.sh");
  const herdrFile = run.HERDR_CONFIG_PATH;
  const colorsFile = join(run.STATE_DIR, "terminal-colors.json");
  if (!herdrFile) throw new Error("run.env has no HERDR_CONFIG_PATH; start the run with this checkout's up.sh");
  const { THEMES } = await import(join(run.CHECKOUT, "herdr-themes.ts"));
  const paneColors = read(colorsFile);
  step(`terminal colors from the chat pane query: ${paneColors || "(none: the headless herdr has no host terminal)"}`);
  writeFileSync(herdrFile, '[theme]\nname = "gruvbox"\n');
  const want = { auto: THEMES.gruvbox.panel_bg, dark: THEMES.gruvbox.panel_bg, light: THEMES["gruvbox-light"].panel_bg };
  step(`herdr theme gruvbox; expected backgrounds: ${JSON.stringify(want)}`);

  // The control is in the settings popover: open it when it is closed (after a reload, or on the second page).
  const openSettings = (p = page) => p.evaluate(() => document.getElementById("settings")!.hidden && document.getElementById("gear")!.click());
  const pressed = async (p = page) => {
    await openSettings(p);
    return p.evaluate(() => [...document.querySelectorAll("#settings .themesw button")].find((b) => b.getAttribute("aria-pressed") === "true")?.textContent);
  };
  const choose = async (mode: string) => {
    await openSettings();
    await page.locator(`#settings [data-id="theme:${mode}"]`).click();
  };
  const bg = (p = page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const waitMode = (what: string, label: string, color: string | null, p = page) =>
    until(what, async () => (await pressed(p)) === label && (color === null || (await bg(p)) === rgb(color)));
  const seed = '# my settings\n[status]\nmode = true # keep\n\n[input]\nsend_key = "enter"\n';
  const fileText = () => read(file);

  try {
    writeFileSync(file, seed);
    await page.locator("#items .msg.user", { hasText: "Fixture question" }).waitFor();
    await page.locator("#status .seg").first().waitFor();
    await page.locator("#items details.steps").first().evaluate((d: HTMLDetailsElement) => (d.open = true));
    const input = page.locator("#input");
    await input.fill("Code check:\n```js\nconst x = 1; // sample\n```\nand `inline` code");
    await input.press("Enter");
    await page.locator("#items .msg.assistant pre code", { hasText: "const x = 1;" }).waitFor({ timeout: 10_000 });
    await page.evaluate(() => ((window as any).__noReload = true));
    const second = await page.context().browser()!.newPage();
    await second.goto(run.URL);

    await waitMode("Auto is marked, terminal colors", "Auto", want.auto);
    step(`auto: background ${await bg()} is the panel_bg of the herdr theme`);
    await j.shot("auto");

    await choose("light");
    await waitMode("Light is marked and light colors apply", "Light", want.light);
    await waitMode("the second page follows", "Light", want.light, second);
    step(`light: background ${await bg()}, the second page too`);
    if (fileText() !== `${seed}\n[theme]\nmode = "light"\n`) throw new Error(`config.toml after Light:\n${fileText()}`);
    step(`config.toml kept its content and comments and got [theme]:\n${fileText()}`);
    await page.locator("#status .seg").first().waitFor();
    await j.shot("light");
    await second.screenshot({ path: `${j.out}/second-page-light.png` });

    await choose("dark");
    await waitMode("Dark is marked and dark colors apply", "Dark", want.dark);
    if (fileText() !== `${seed}\n[theme]\nmode = "dark"\n`) throw new Error(`config.toml after Dark:\n${fileText()}`);
    step(`dark: background ${await bg()}; the value is replaced in place`);
    await j.shot("dark");

    await choose("auto");
    await waitMode("Auto again", "Auto", want.auto);
    if (!fileText().endsWith('[theme]\nmode = "auto"\n')) throw new Error(`config.toml after Auto:\n${fileText()}`);

    await openSettings();
    await page.locator('#settings [data-id="theme:dark"]').focus();
    await page.keyboard.press("Tab");
    if ((await page.evaluate(() => document.activeElement?.getAttribute("data-id"))) !== "theme:light") throw new Error("Tab does not reach the Light button");
    await page.keyboard.press("Enter");
    await waitMode("Light by keyboard", "Light", want.light);
    step("keyboard: Tab to Light and Enter chose it");
    await j.shot("light-focus");

    const handed = fileText().replace('mode = "light"', 'mode = "dark" # by hand');
    writeFileSync(file, handed);
    await waitMode("a hand edit to dark shows in both open pages", "Dark", want.dark);
    await waitMode("the second page follows the hand edit", "Dark", want.dark, second);
    step("hand edit: mode = dark changed the control and the colors with no reload");

    if (!(await page.evaluate(() => (window as any).__noReload))) throw new Error("the page reloaded");
    await page.reload();
    await waitMode("the choice survives a reload", "Dark", want.dark);
    step("reload keeps Dark");
    if (!fileText().includes('mode = "dark" # by hand')) throw new Error("the page changed the file");

    await choose("light");
    await waitMode("Light again", "Light", want.light);
    if (!fileText().includes('mode = "light" # by hand')) throw new Error(`the comment after the value is lost:\n${fileText()}`);
    await page.reload();
    await waitMode("Light survives a reload", "Light", want.light);
    step("Light survives a reload; the comment after the value is kept");

    const refused = await page.evaluate(async (t) => {
      const post = (body: unknown) => fetch(`/api/config?t=${t}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => [r.status, (await r.json()).error]);
      return [await post({ table: "theme", key: "mode", value: "sepia" }), await post({ table: "colors", key: "mode", value: "dark" })];
    }, run.TOKEN);
    if (!refused.every(([status]) => status === 400)) throw new Error(`bad writes were not refused: ${JSON.stringify(refused)}`);
    if (!fileText().includes('mode = "light" # by hand')) throw new Error("a refused write changed the file");
    step(`refused writes: ${JSON.stringify(refused)}; the file is unchanged`);

    // The terminal second: herdr's terminal theme takes the background and the ANSI colors from the terminal colors file.
    writeFileSync(file, fileText().replace('mode = "light" # by hand', 'mode = "auto"'));
    writeFileSync(colorsFile, JSON.stringify(TERMINAL));
    writeFileSync(herdrFile, '[theme]\nname = "terminal"\n');
    await waitMode("herdr terminal theme takes the terminal background", "Auto", TERMINAL.bg);
    const c = await page.evaluate(() => [1, 9].map((i) => getComputedStyle(document.documentElement).getPropertyValue(`--c${i}`).trim()));
    if (c[0] !== TERMINAL.ansi[1] || c[1] !== TERMINAL.ansi[9]) throw new Error(`ANSI colors are ${c}, want ${TERMINAL.ansi[1]} and ${TERMINAL.ansi[9]}`);
    step(`herdr theme terminal: background ${await bg()}, --c1 ${c[0]}, --c9 ${c[1]} from the terminal colors file`);
    await j.shot("terminal");

    // A hand edit of the herdr theme shows with no reload.
    writeFileSync(herdrFile, '[theme]\nname = "nord"\n');
    await waitMode("herdr theme nord", "Auto", THEMES.nord.panel_bg);
    step(`herdr theme nord: background ${await bg()}`);

    // The built-in palettes, as a page without theme.css gets them: one copy, picked by color-scheme.
    await page.evaluate(() => document.getElementById("theme")!.remove());
    for (const scheme of ["light", "dark"] as const) {
      await page.evaluate((s) => (document.documentElement.style.colorScheme = s), scheme);
      if ((await bg()) !== rgb(BUILTIN[scheme])) throw new Error(`built-in ${scheme} background is ${await bg()}`);
      step(`built-in ${scheme} palette: background ${await bg()}`);
      await j.shot(`builtin-${scheme}`);
    }
    await second.close();
  } finally {
    rmSync(file, { force: true });
    rmSync(herdrFile, { force: true });
    if (paneColors) writeFileSync(colorsFile, paneColors);
    else rmSync(colorsFile, { force: true });
  }
}
