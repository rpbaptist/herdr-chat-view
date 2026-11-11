// Feature: autocomplete. Type "/" in the composer, filter, pick with Tab or Enter.
// Proves: transcript skill_listing -> server "completions" event -> popup;
// built-in commands; a live delta listing; popup keys do not reach the agent;
// with the popup closed, Esc and Shift+Tab still reach the agent.
import { appendFileSync } from "node:fs";
import type { Journey } from "../scripts/page.ts";

export default async function (j: Journey) {
  const { page, step, until, run } = j;
  const input = page.locator("#input");
  const popup = page.locator("#complete");
  const option = (name: string) => popup.locator(".opt", { has: page.locator(".nm", { hasText: new RegExp(`^${name.replace(/[$/]/g, "\\$&")}$`) }) });
  const sentKeys: string[][] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/keys")) sentKeys.push(JSON.parse(r.postData() ?? "{}").keys ?? []);
  });
  const noKeys = (what: string) => {
    if (sentKeys.length) throw new Error(`${what}: keys reached the agent: ${JSON.stringify(sentKeys)}`);
  };
  const typeFresh = async (text: string) => {
    await input.fill("");
    await input.pressSequentially(text);
  };

  await page.locator("#items .msg.user", { hasText: "Fixture question" }).waitFor();
  await j.shot("before");

  step('type "/ver": the popup shows the verify skill with its description');
  await typeFresh("/ver");
  await option("/verify").waitFor({ timeout: 5_000 });
  if (!(await option("/verify").locator(".ds").textContent())?.includes("Drive the real herdr-chat-view plugin")) throw new Error("verify has no description");
  await j.shot("ver-popup");
  step("Tab inserts /verify and closes the popup");
  await input.press("Tab");
  if ((await input.inputValue()) !== "/verify ") throw new Error(`Tab inserted ${JSON.stringify(await input.inputValue())}`);
  if (await popup.isVisible()) throw new Error("popup still open after Tab");
  noKeys("Tab with popup open");
  await j.shot("ver-inserted");

  step('type "/gril": the plugin skill matches on the part after the colon');
  await typeFresh("/gril");
  await option("/mattpocock-skills:grilling").waitFor({ timeout: 5_000 });
  await j.shot("gril-popup");

  step('type "/comp": the built-in /compact shows');
  await typeFresh("/comp");
  await option("/compact").waitFor({ timeout: 5_000 });
  await j.shot("comp-popup");

  step("Down moves the selection; Enter inserts and does not send");
  await typeFresh("/");
  const first = await popup.locator(".opt.on .nm").textContent();
  await input.press("ArrowDown");
  const second = await popup.locator(".opt.on .nm").textContent();
  if (!first || !second || first === second) throw new Error(`Down did not move the selection: ${first} -> ${second}`);
  await input.press("ArrowUp");
  if ((await popup.locator(".opt.on .nm").textContent()) !== first) throw new Error("Up did not move the selection back");
  const before = j.transcript().length;
  await input.press("Enter");
  if ((await input.inputValue()) !== `${first} `) throw new Error(`Enter inserted ${JSON.stringify(await input.inputValue())}`);
  await Bun.sleep(1500);
  if (j.transcript().length !== before) throw new Error("Enter with the popup open sent a prompt");
  noKeys("Up/Down/Enter with popup open");
  await j.shot("enter-inserted");

  step("no match closes the popup");
  await typeFresh("/zzzqqq");
  if (await popup.isVisible()) throw new Error("popup open with no match");

  step("a skill_listing delta in the transcript shows without a reload");
  await typeFresh("/fresh");
  if (await popup.isVisible()) throw new Error("fresh-skill shows before the delta");
  appendFileSync(run.TRANSCRIPT, JSON.stringify({
    type: "attachment", uuid: "verify-delta", timestamp: new Date().toISOString(),
    attachment: { type: "skill_listing", isInitial: false, skillCount: 1, names: ["fresh-skill"], content: "- fresh-skill: Added by a live delta listing." },
  }) + "\n");
  await option("/fresh-skill").waitFor({ timeout: 5_000 });
  await j.shot("delta-popup");

  step("Esc with the popup open closes it and does not reach the agent");
  await input.fill("");
  j.herdr("pane", "send-text", run.AGENT_PANE, "pending");
  await until("agent box has pending", () => j.agentScreen().includes("❯ pending"));
  await input.pressSequentially("/ver");
  await option("/verify").waitFor();
  await input.press("Escape");
  if (await popup.isVisible()) throw new Error("popup still open after Esc");
  await Bun.sleep(1000);
  noKeys("Esc with popup open");
  if (!j.agentScreen().includes("❯ pending")) throw new Error("Esc with the popup open reached the agent");
  await j.shot("esc-closed");
  step("after Esc, a new /ver opens the popup again");
  await input.fill("");
  await input.pressSequentially("/ver");
  await option("/verify").waitFor({ timeout: 5_000 });
  await input.fill("/ver");
  await input.press("Escape");
  if (await popup.isVisible()) throw new Error("popup still open after the second Esc");
  noKeys("second Esc with popup open");

  step("popup closed: Esc reaches the agent and clears its box");
  await input.press("Escape");
  await until("agent box cleared", () => !j.agentScreen().includes("❯ pending"));
  if (JSON.stringify(sentKeys) !== '[["esc"]]') throw new Error(`expected one esc, got ${JSON.stringify(sentKeys)}`);

  step("popup closed: Shift+Tab still cycles the mode");
  const mode = j.agentScreen().match(/mode: (\d)/)?.[1];
  await input.press("Shift+Tab");
  await until("mode changed", () => j.agentScreen().match(/mode: (\d)/)?.[1] !== mode);
  await j.shot("after");
  await input.fill("");
  await input.dispatchEvent("input");
}
