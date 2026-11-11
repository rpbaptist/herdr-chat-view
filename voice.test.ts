import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendText, parseVoice, startDictation, voiceSettings, type Exec } from "./voice.ts";

describe("parseVoice", () => {
  test("defaults to auto", () => expect(parseVoice({})).toEqual({ tool: "auto" }));
  test("reads tool", () => {
    for (const tool of ["auto", "off", "voxtype"]) expect(parseVoice({ tool })).toEqual({ tool } as any);
  });
  test("rejects a bad tool and an unknown key", () => {
    expect(() => parseVoice({ tool: "monologue" })).toThrow(/voice\.tool must be "auto" or "off" or "voxtype"/);
    expect(() => parseVoice({ tool: true })).toThrow(/voice\.tool/);
    expect(() => parseVoice({ tol: "off" })).toThrow(/unknown key voice\.tol/);
  });
});

describe("voiceSettings", () => {
  const on = (bin: string) => (bin === "voxtype" ? "/usr/bin/voxtype" : null);
  const none = () => null;
  test("off hides the button", () => expect(voiceSettings({ tool: "off" }, on)).toBeNull());
  test("auto finds voxtype on PATH", () => expect(voiceSettings({ tool: "auto" }, on)).toEqual({ tool: "voxtype" }));
  test("a named tool on PATH", () => expect(voiceSettings({ tool: "voxtype" }, on)).toEqual({ tool: "voxtype" }));
  test("no tool on PATH gives the reason", () => {
    expect(voiceSettings({ tool: "auto" }, none)).toEqual({ tool: null, reason: expect.stringMatching(/needs voxtype on PATH/) });
    expect(voiceSettings({ tool: "voxtype" }, none)).toEqual({ tool: null, reason: expect.stringMatching(/needs voxtype/) });
  });
});

describe("appendText", () => {
  test("joins with one space, or after the draft's own white space", () => {
    expect(appendText("", "hello")).toBe("hello");
    expect(appendText("fix", "the bug")).toBe("fix the bug");
    expect(appendText("fix ", "the bug")).toBe("fix the bug");
    expect(appendText("line\n", "next")).toBe("line\nnext");
  });
});

// A stand-in for voxtype: it records the calls, and `finish` writes the result as voxtype does.
function fakeVoxtype(initial = "idle") {
  const calls: string[] = [];
  let state = initial;
  let file = "";
  const exec: Exec = async ([bin, ...args]) => {
    calls.push(args.join(" "));
    expect(bin).toBe("/bin/voxtype");
    if (args[0] === "status") return { code: 0, out: `${state}\n`, err: "" };
    const cmd = args[1];
    if (cmd === "start") {
      file = args[2].replace(/^--file=/, "");
      state = "recording";
    } else if (cmd === "stop") state = "transcribing";
    else if (cmd === "cancel") state = "idle";
    return { code: 0, out: "", err: "" };
  };
  const finish = (text: string | null, status = "ok") => {
    if (text !== null) writeFileSync(file, text + "\n");
    writeFileSync(`${file}.done`, JSON.stringify({ status, chars: text?.length ?? 0 }));
    state = "idle";
  };
  return { exec, calls, finish, set: (s: string) => (state = s), file: () => file };
}

describe("startDictation", () => {
  let dir = "";
  const path = () => join((dir ||= mkdtempSync(join(tmpdir(), "voice-test-"))), "voice.txt");
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  test("start, stop, then the text, and the files are gone", async () => {
    const v = fakeVoxtype();
    const d = await startDictation("voxtype", "/bin/voxtype", v.exec, path(), "p1");
    expect(d.pane).toBe("p1");
    expect(d.state).toBe("recording");
    expect(v.calls).toEqual(["status", `record start --file=${path()}`]);
    expect(await d.poll()).toBeNull();
    await d.stop();
    expect(d.state).toBe("transcribing");
    expect(await d.poll()).toBeNull();
    v.finish("hello there");
    expect(await d.poll()).toBe("hello there");
    expect(d.state).toBe("idle");
    expect(existsSync(path()) || existsSync(`${path()}.done`)).toBe(false);
    expect(v.calls).toContain("record stop");
  });

  test("the tool's state shows in the dictation", async () => {
    const v = fakeVoxtype();
    const d = await startDictation("voxtype", "/bin/voxtype", v.exec, path(), "p1");
    v.set("transcribing");
    await d.poll();
    expect(d.state).toBe("transcribing");
  });

  test("does not start when the tool is busy or its daemon does not run", async () => {
    await expect(startDictation("voxtype", "/bin/voxtype", fakeVoxtype("recording").exec, path(), "p1")).rejects.toThrow("voxtype is busy (recording)");
    await expect(startDictation("voxtype", "/bin/voxtype", fakeVoxtype("stopped").exec, path(), "p1")).rejects.toThrow("voxtype cannot record: stopped");
  });

  test("gives the tool's message when a command fails", async () => {
    const exec: Exec = async ([, ...args]) =>
      args[0] === "status" ? { code: 0, out: "idle", err: "" } : { code: 1, out: "", err: "Error: daemon not responding\nmore" };
    await expect(startDictation("voxtype", "/bin/voxtype", exec, path(), "p1")).rejects.toThrow(/^Error: daemon not responding$/);
  });

  test("cancel discards the recording", async () => {
    const v = fakeVoxtype();
    const d = await startDictation("voxtype", "/bin/voxtype", v.exec, path(), "p1");
    await d.cancel();
    expect(d.state).toBe("idle");
    expect(v.calls.at(-1)).toBe("record cancel");
  });

  test("stop does nothing after recording ended", async () => {
    const v = fakeVoxtype();
    const d = await startDictation("voxtype", "/bin/voxtype", v.exec, path(), "p1");
    await d.stop();
    await d.stop();
    expect(v.calls.filter((c) => c === "record stop")).toHaveLength(1);
  });

  test("ends with no text when the tool goes idle with no result", async () => {
    const v = fakeVoxtype();
    const d = await startDictation("voxtype", "/bin/voxtype", v.exec, path(), "p1");
    v.set("idle");
    expect(await d.poll()).toBeNull();
    expect(await d.poll()).toBeNull();
    expect(await d.poll()).toBe("");
    expect(d.state).toBe("idle");
  });

  test("an error marker or a stopped daemon ends the dictation with an error", async () => {
    const v = fakeVoxtype();
    const d = await startDictation("voxtype", "/bin/voxtype", v.exec, path(), "p1");
    v.finish(null, "error");
    await expect(d.poll()).rejects.toThrow("voxtype: error");
    expect(d.state).toBe("idle");

    const w = fakeVoxtype();
    const e = await startDictation("voxtype", "/bin/voxtype", w.exec, path(), "p1");
    w.set("stopped");
    await expect(e.poll()).rejects.toThrow("voxtype cannot record: stopped");
    expect(e.state).toBe("idle");
  });
});
