// Feature: theme. The Auto / Dark / Light control in the top bar, and [theme] mode in config.toml.
// Proves: click or key -> POST /api/config -> config.toml text (other content kept) -> settings and theme
// events -> computed colors of every open page; a hand edit of the file; and a reload that keeps the choice.
// The expected colors come from the real herdr config and Omarchy theme files, read here the way a user would find them.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Journey } from "../scripts/page.ts";

const BUILTIN = { dark: "#262624", light: "#faf9f5" };
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const bgOf = (colors: string) => /^\s*background\s*=\s*"(#[0-9a-fA-F]{6})"/m.exec(colors)?.[1] ?? null;

function themeBg(name: string | null): string | null {
  if (name === null) return bgOf(read(join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "omarchy/current/theme/colors.toml")));
  const dir = Bun.spawnSync(["omarchy", "theme", "dir", name]).stdout.toString().trim();
  return dir ? bgOf(read(join(dir, "colors.toml"))) : null;
}

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const file = run.HERDR_CHAT_CONFIG;
  if (!file) throw new Error("run.env has no HERDR_CHAT_CONFIG; start the run with this checkout's up.sh");
  const herdrConfig = Bun.TOML.parse(read(process.env.HERDR_CONFIG_PATH ?? join(homedir(), ".config/herdr/config.toml"))) as any;
  const names = { dark: herdrConfig.theme?.dark_name as string | undefined, light: herdrConfig.theme?.light_name as string | undefined };
  const active = themeBg(null);
  const want = {
    auto: active ?? null,
    dark: (names.dark && themeBg(names.dark)) || active || BUILTIN.dark,
    light: (names.light && themeBg(names.light)) || BUILTIN.light,
  };
  step(`expected backgrounds: ${JSON.stringify(want)} (herdr dark_name=${names.dark}, light_name=${names.light}, active=${active})`);
  if (want.light === want.dark) throw new Error("this machine's themes give the same light and dark background; the journey cannot tell them apart");

  const pressed = (p = page) => p.evaluate(() => [...document.querySelectorAll("#themesw button")].find((b) => b.getAttribute("aria-pressed") === "true")?.textContent);
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
    if (want.auto) step(`auto: background ${await bg()} is the active Omarchy theme`);
    await j.shot("auto");

    await page.locator('#themesw [data-mode="light"]').click();
    await waitMode("Light is marked and light colors apply", "Light", want.light);
    await waitMode("the second page follows", "Light", want.light, second);
    step(`light: background ${await bg()}, the second page too`);
    if (fileText() !== `${seed}\n[theme]\nmode = "light"\n`) throw new Error(`config.toml after Light:\n${fileText()}`);
    step(`config.toml kept its content and comments and got [theme]:\n${fileText()}`);
    await page.locator("#status .seg").first().waitFor();
    await j.shot("light");
    await second.screenshot({ path: `${j.out}/second-page-light.png` });

    await page.locator('#themesw [data-mode="dark"]').click();
    await waitMode("Dark is marked and dark colors apply", "Dark", want.dark);
    if (fileText() !== `${seed}\n[theme]\nmode = "dark"\n`) throw new Error(`config.toml after Dark:\n${fileText()}`);
    step(`dark: background ${await bg()}; the value is replaced in place`);
    await j.shot("dark");

    await page.locator('#themesw [data-mode="auto"]').click();
    await waitMode("Auto again", "Auto", want.auto);
    if (!fileText().endsWith('[theme]\nmode = "auto"\n')) throw new Error(`config.toml after Auto:\n${fileText()}`);

    await page.locator('#themesw [data-mode="dark"]').focus();
    await page.keyboard.press("Tab");
    if ((await page.evaluate(() => document.activeElement?.getAttribute("data-mode"))) !== "light") throw new Error("Tab does not reach the Light button");
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

    await page.locator('#themesw [data-mode="light"]').click();
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

    // The built-in palettes, as an Omarchy install without the herdr themes gets them: one copy, picked by color-scheme.
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
  }
}
