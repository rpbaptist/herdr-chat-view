// Feature: close and recovery of the two views. Run it last: it closes the chat pane
// that up.sh opened, so CHAT_PANE in run.env is stale after it and doctor.sh fails.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey } from "../scripts/page.ts";

type Rec = { chat: string; view: string };

export default async function (j: Journey) {
  const { run, step } = j;
  const agent = run.AGENT_PANE;
  const map = (): Record<string, Rec> => JSON.parse(readFileSync(join(run.STATE_DIR, "panes.json"), "utf8"));
  const tabOf = (pane: string): string | null => j.herdr("pane", "list").panes.find((p: { pane_id: string }) => p.pane_id === pane)?.tab_id ?? null;
  const tabs = () => j.herdr("tab", "list").tabs.map((t: { tab_id: string }) => t.tab_id) as string[];
  const action = (name: string, pane: string) => {
    const p = Bun.spawnSync(["bun", join(run.CHECKOUT, "herdr-chat.ts"), name], {
      env: { ...process.env, HERDR_SOCKET_PATH: run.HERDR_SOCKET_PATH, HERDR_PANE_ID: pane, HERDR_CHAT_CONFIG: run.HERDR_CHAT_CONFIG },
    });
    if (p.exitCode !== 0) throw new Error(`${name} from ${pane}: ${p.stderr.toString()}`);
  };
  let n = 0;
  const record = (name: string) => {
    const state = { panes: j.herdr("pane", "list").panes.map((p: { pane_id: string; tab_id: string }) => ({ pane_id: p.pane_id, tab_id: p.tab_id })), tabs: tabs(), map: map() };
    writeFileSync(join(j.out, `${String(++n).padStart(2, "0")}-${name}.json`), JSON.stringify(state, null, 2));
    step(`${name}: ${JSON.stringify(state)}`);
    return state;
  };
  const assert = (ok: unknown, msg: string) => {
    if (!ok) throw new Error(msg);
  };

  const chat = map()[agent]?.chat;
  assert(chat && map()[agent].view === "chat", "precondition: the chat view shows");
  const home = tabOf(chat)!;
  record("start");

  step("close from the chat pane");
  action("close", chat);
  let s = record("closed");
  assert(tabOf(agent) === home, "close: the terminal is back in the tab of the chat");
  assert(!tabOf(chat), "close: the chat pane is closed");
  assert(!map()[agent], "close: the pane map has no entry for the agent");
  assert(s.tabs.length === 1, "close: no tab is left over");

  step("close again: no change");
  action("close", agent);
  assert(JSON.stringify(record("closed-again").tabs) === JSON.stringify(s.tabs), "second close changed the tabs");

  step("toggle from the agent opens a new chat in the slot of the agent");
  action("toggle", agent);
  const chat2 = map()[agent]?.chat;
  s = record("reopened");
  assert(chat2 && chat2 !== chat, "toggle: a new chat pane");
  assert(tabOf(chat2) === home && tabOf(agent) !== home, "toggle: the chat shows and the terminal waits in another tab");

  step("the user closes the chat pane by hand");
  j.herdr("pane", "close", chat2);
  const parked = tabOf(agent)!;
  record("chat-closed-by-hand");
  action("toggle", agent);
  const chat3 = map()[agent]?.chat;
  s = record("recovered");
  assert(chat3 && chat3 !== chat2, "toggle after a closed chat: a new chat pane");
  assert(tabOf(chat3) === parked && tabOf(agent) !== parked, "toggle after a closed chat: the chat takes the slot of the agent");
  assert(s.tabs.length === 2, `toggle after a closed chat: ${s.tabs.length} tabs, want 2`);
}
