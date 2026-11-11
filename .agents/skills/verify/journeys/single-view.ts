// Feature: single-view (issue #14). Only one view of the agent shows in its tab,
// also after the user splits a new pane next to it. Each switch puts the shown view
// in the slot of the other view, and a second switch to the same view changes nothing.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey } from "../scripts/page.ts";

type Rect = { x: number; y: number; width: number; height: number };

export default async function (j: Journey) {
  const { page, run, step, until } = j;
  const { AGENT_PANE: agent, CHAT_PANE: chat } = run;

  // The panes a user sees in the tab of `pane`: all of them, or only the focused one when zoomed.
  const visible = (pane: string) => {
    const { layout } = j.herdr("pane", "layout", "--pane", pane);
    const ids: string[] = layout.zoomed ? [layout.focused_pane_id] : layout.panes.map((p: { pane_id: string }) => p.pane_id);
    const rects: Record<string, Rect> = Object.fromEntries(layout.panes.map((p: { pane_id: string; rect: Rect }) => [p.pane_id, p.rect]));
    return { ids: ids.sort(), focused: layout.focused_pane_id as string, rects, layout };
  };
  const record = (name: string, pane: string) => {
    const v = visible(pane);
    const tabs = j.herdr("tab", "list").tabs.map((t: { tab_id: string; label: string; pane_count: number }) => ({ tab_id: t.tab_id, label: t.label, pane_count: t.pane_count }));
    writeFileSync(join(j.out, `${name}.json`), JSON.stringify({ layout: v.layout, tabs, panes: j.herdr("pane", "list").panes }, null, 2));
    step(`${name}: visible ${v.ids.join(" ")}, focused ${v.focused}, ${tabs.length} tabs`);
    return { ...v, tabs };
  };
  const expectVisible = (v: { ids: string[] }, want: string[], what: string) => {
    if (JSON.stringify(v.ids) !== JSON.stringify([...want].sort())) throw new Error(`${what}: visible ${v.ids.join(" ")}, want ${[...want].sort().join(" ")}`);
  };
  const toggleFrom = (pane: string) => {
    const p = Bun.spawnSync(["bun", join(run.CHECKOUT, "herdr-chat.ts"), "toggle"], {
      env: { ...process.env, HERDR_SOCKET_PATH: run.HERDR_SOCKET_PATH, HERDR_PANE_ID: pane, HERDR_CHAT_CONFIG: run.HERDR_CHAT_CONFIG },
    });
    if (p.exitCode !== 0) throw new Error(`toggle from ${pane}: ${p.stderr.toString()}`);
  };

  await page.locator("#items .msg.user", { hasText: "Fixture question" }).waitFor();
  const before = record("01-before-split", chat);
  expectVisible(before, [chat], "chat view before the split");
  await j.shot("chat-view");

  step("split a new pane from the chat pane");
  const extra: string = j.herdr("pane", "split", chat, "--direction", "down", "--focus").pane.pane_id;
  const split = record("02-after-split", chat);
  expectVisible(split, [chat, extra], "chat view after the split");

  step("click Terminal");
  await page.locator("#term").click();
  await until("terminal shows next to the new pane", () => {
    const v = visible(agent);
    return v.focused === agent && JSON.stringify(v.ids) === JSON.stringify([agent, extra].sort());
  });
  const term = record("03-terminal", agent);
  if (term.focused !== agent) throw new Error(`terminal view: focus on ${term.focused}, want ${agent}`);
  if (JSON.stringify(term.rects[agent]) !== JSON.stringify(split.rects[chat])) throw new Error("terminal did not take the slot of the chat");
  await j.shot("after-terminal");

  step("click Terminal again: no change");
  await page.locator("#term").click();
  await Bun.sleep(1000);
  const again = record("04-terminal-again", agent);
  expectVisible(again, [agent, extra], "terminal view after a second switch");
  if (again.tabs.length !== term.tabs.length) throw new Error(`second switch changed the tab count: ${term.tabs.length} -> ${again.tabs.length}`);

  step("toggle from the agent pane");
  toggleFrom(agent);
  const back = record("05-chat-again", chat);
  expectVisible(back, [chat, extra], "chat view after toggle");
  if (back.focused !== chat) throw new Error(`chat view: focus on ${back.focused}, want ${chat}`);
  if (JSON.stringify(back.rects[chat]) !== JSON.stringify(term.rects[agent])) throw new Error("chat did not take the slot of the terminal");

  step("toggle from the agent pane again: no change");
  toggleFrom(agent);
  const twice = record("06-chat-twice", chat);
  expectVisible(twice, [chat, extra], "chat view after a second toggle");
  if (twice.tabs.length !== back.tabs.length) throw new Error(`second toggle changed the tab count: ${back.tabs.length} -> ${twice.tabs.length}`);

  step("prompt the agent while its terminal is in the other tab");
  const text = `single view ${Date.now()}`;
  await page.locator("#input").fill(text);
  await page.locator("#input").press("Enter");
  await page.locator("#items .msg.assistant", { hasText: `echo: ${text}` }).waitFor({ timeout: 10_000 });
  await until("agent pane shows the prompt", () => j.agentScreen().includes(`last: ${text}`));
  await j.shot("chat-with-split");

  j.herdr("pane", "close", extra);
  step(`closed ${extra}`);
}
