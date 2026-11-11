// Feature: fonts. [font] in config.toml sets the text and code fonts and sizes, live.
// Proves: config file -> server timer -> /theme.css variables -> theme event -> computed styles of
// the open page, with no reload; "terminal" for sans; and a bad value that shows in #err.
import { rmSync, writeFileSync } from "node:fs";
import type { Journey } from "../scripts/page.ts";

type Look = { sans: string; size: string; mono: string; seg: string; pre: string; spinner: string };

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const file = run.HERDR_CHAT_CONFIG;
  if (!file) throw new Error("run.env has no HERDR_CHAT_CONFIG; start the run with this checkout's up.sh");
  const write = (text: string) => {
    step(`write config.toml:\n${text}`);
    writeFileSync(file, text);
  };
  await page.evaluate(() => {
    const pre = document.createElement("pre");
    pre.id = "probe";
    pre.innerHTML = "<code>const x = 1;</code>";
    document.body.append(pre);
    const spin = document.createElement("span");
    spin.id = "probe-spinner";
    spin.innerHTML = '<span class="spinner">x</span>';
    spin.className = "probe";
    (document.querySelector("#working") as HTMLElement).append(spin);
  });
  const look = (): Promise<Look> =>
    page.evaluate(() => {
      const css = (sel: string) => getComputedStyle(document.querySelector(sel)!);
      return {
        sans: css("body").fontFamily, size: css("body").fontSize, mono: css("#probe").fontFamily,
        seg: css("#status .seg").fontSize, pre: css("#probe").fontSize, spinner: css("#working .spinner").fontSize,
      };
    });
  const waitLook = (what: string, ok: (l: Look) => boolean) =>
    until(what, async () => {
      const l = await look();
      return ok(l) ? l : false;
    }) as Promise<Look>;

  const omarchy = Bun.spawnSync(["omarchy", "font", "current"]);
  const family = omarchy.exitCode === 0 ? omarchy.stdout.toString().trim() : "";
  // Chromium serializes a single-word family without quotes.
  const ser = (name: string) => (/^[A-Za-z][\w-]*$/.test(name) ? name : `"${name}"`);
  const defaultMono = family ? `${ser(family)}, monospace` : "monospace";
  const defaultSans = 'Inter, Geist, system-ui, -apple-system, "Segoe UI", sans-serif';

  try {
    rmSync(file, { force: true });
    await page.locator("#status .seg").first().waitFor();
    await page.evaluate(() => ((window as any).__noReload = true));
    let l = await look();
    const want = { sans: defaultSans, size: "15px", mono: defaultMono, seg: "11.5px", pre: "13px", spinner: "15px" };
    if (JSON.stringify(l) !== JSON.stringify(want)) throw new Error(`default look ${JSON.stringify(l)} is not ${JSON.stringify(want)}`);
    step(`no config: Omarchy font ${family || "(none)"}, sans stack, 15px text, 13px code: ${JSON.stringify(l)}`);
    await j.shot("default");

    write('[font]\nsans = "Lato, Helvetica"\n');
    l = await waitLook("sans font changed", (x) => x.sans === "Lato, Helvetica, sans-serif");
    if (l.size !== "15px" || l.mono !== defaultMono) throw new Error(`sans changed more than the sans font: ${JSON.stringify(l)}`);
    step(`sans = "Lato, Helvetica": ${l.sans}`);
    await j.shot("sans");

    write('[font]\nmono = "Fira Code"\n');
    l = await waitLook("mono font changed", (x) => x.mono === '"Fira Code", monospace');
    if (l.sans !== defaultSans) throw new Error(`mono changed the sans font: ${l.sans}`);
    step(`mono = "Fira Code": ${l.mono}`);
    await j.shot("mono");

    write("[font]\nsize = 20\n");
    l = await waitLook("text size changed", (x) => x.size === "20px");
    if (l.pre !== "13px" || l.seg !== "11.5px") throw new Error(`size changed the code size: ${JSON.stringify(l)}`);
    step(`size = 20: body ${l.size}, code still ${l.pre}`);
    await j.shot("size");

    write("[font]\nmono_size = 20\n");
    l = await waitLook("code size changed", (x) => x.pre === "20px");
    const seg = (20 * 11.5) / 13;
    if (Math.abs(parseFloat(l.seg) - seg) > 0.01 || Math.abs(parseFloat(l.spinner) - (20 * 15) / 13) > 0.01 || l.size !== "15px")
      throw new Error(`mono_size did not scale the code elements only: ${JSON.stringify(l)}`);
    step(`mono_size = 20: code ${l.pre}, chip ${l.seg}, spinner ${l.spinner}, body ${l.size}`);
    await j.shot("mono-size");

    write('[font]\nsans = "terminal"\nmono = "Fira Code"\n');
    l = await waitLook("sans uses the terminal font", (x) => x.sans === '"Fira Code", monospace');
    step(`sans = "terminal": body font ${l.sans}`);
    await j.shot("terminal");

    write('[font]\nmono = "a; b"\nsize = 30\n');
    const err = await until("config error in #err", async () => (await page.locator("#err").textContent())?.trim());
    if (!/font\.mono: bad font name "a; b"/.test(err)) throw new Error(`unexpected error text: ${err}`);
    l = await waitLook("defaults again", (x) => x.size === "15px");
    if (JSON.stringify(l) !== JSON.stringify(want)) throw new Error(`error did not give the defaults: ${JSON.stringify(l)}`);
    step(`error shows and the defaults apply: ${err}`);
    await j.shot("error");

    write("[font]\nsize = 3\n");
    const err2 = await until("size error in #err", async () => {
      const text = (await page.locator("#err").textContent())?.trim() ?? "";
      return /font\.size must be a number from 8 to 40/.test(text) && text;
    });
    step(`range error: ${err2}`);

    write("");
    await until("error cleared", async () => !(await page.locator("#err").textContent())?.trim());
    await waitLook("defaults after clearing", (x) => JSON.stringify(x) === JSON.stringify(want));
    await j.shot("cleared");

    if (!(await page.evaluate(() => (window as any).__noReload))) throw new Error("the page reloaded");
    step("all changes showed with no page reload");
  } finally {
    rmSync(file, { force: true });
  }
}
