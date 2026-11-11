// Feature: send-message. Type in the composer, press Enter, see the reply.
// Proves: page -> /api/prompt -> herdr agent prompt -> agent pane input ->
// transcript -> server pump -> rendered chat items.
import type { Journey } from "../scripts/page.ts";

export default async function (j: Journey) {
  const { page, step, until } = j;
  const text = `verify ${Date.now()}`;

  await page.locator("#items .msg.user", { hasText: "Fixture question" }).waitFor();
  await j.shot("before");

  step(`type "${text}" and press Enter`);
  await page.locator("#input").fill(text);
  await j.shot("typed");
  await page.locator("#input").press("Enter");

  await page.locator("#items .msg.user", { hasText: text }).waitFor({ timeout: 10_000 });
  await page.locator("#items .msg.assistant", { hasText: `echo: ${text}` }).waitFor({ timeout: 10_000 });
  await j.shot("after");

  // Side effects, not only the screen.
  if ((await page.locator("#input").inputValue()) !== "") throw new Error("composer not cleared after send");
  await until("transcript has the user entry", () =>
    j.transcript().some((l) => l.type === "user" && JSON.stringify(l.message.content).includes(text)));
  step("transcript has the user entry");
  await until("agent pane shows the prompt", () => j.agentScreen().includes(`last: ${text}`));
  step("agent pane received the prompt");
  if ((await page.locator("#err").textContent())?.trim()) throw new Error(`page error: ${await page.locator("#err").textContent()}`);
}
