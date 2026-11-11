import { describe, expect, test } from "bun:test";
import { loadConfig, pageSettings } from "./config.ts";

describe("loadConfig", () => {
  test("gives the defaults when the file is missing", () => {
    const c = loadConfig(null);
    expect(c.error).toBeNull();
    expect(c.input).toEqual({ sendKey: "enter" });
    expect(c.status.mode).toBe(true);
    expect(pageSettings(c)).toEqual({ sendKey: "enter" });
  });

  test("gives the defaults for an empty file", () => {
    expect(loadConfig("")).toEqual(loadConfig(null));
  });

  test("reads send_key from [input]", () => {
    expect(pageSettings(loadConfig('[input]\nsend_key = "ctrl-enter"'))).toEqual({ sendKey: "ctrl-enter" });
    expect(pageSettings(loadConfig('[input]\nsend_key = "enter"'))).toEqual({ sendKey: "enter" });
  });

  test("reads the tables independently", () => {
    const c = loadConfig('[status]\nmode = false\n[input]\nsend_key = "ctrl-enter"');
    expect(c.status.mode).toBe(false);
    expect(c.input.sendKey).toBe("ctrl-enter");
    expect(c.error).toBeNull();
  });

  test("keeps the status defaults when only [input] is set", () => {
    expect(loadConfig('[input]\nsend_key = "ctrl-enter"').status).toEqual(loadConfig(null).status);
  });

  const expectDefaults = (text: string, message: RegExp) => {
    const c = loadConfig(text);
    expect(c.error).toMatch(message);
    expect(c.error).not.toContain("\n");
    expect({ ...c, error: null }).toEqual(loadConfig(null));
  };

  test("reports a bad send_key value and uses the defaults", () => {
    expectDefaults('[input]\nsend_key = "shift-enter"', /input\.send_key must be "enter" or "ctrl-enter"/);
    expectDefaults("[input]\nsend_key = true", /input\.send_key/);
  });

  test("reports an unknown key in [input]", () => {
    expectDefaults('[input]\nsendkey = "enter"', /unknown key input\.sendkey/);
  });

  test("reports an error in [input] next to a valid [status] and uses all defaults", () => {
    expectDefaults('[status]\nmode = false\n[input]\nsend_key = "x"', /input\.send_key/);
  });

  test("reports an unknown table", () => {
    expectDefaults("[font]\nsize = 3", /unknown table font \(use \[status\] or \[input\]\)/);
  });

  test("reports a key outside a table", () => {
    expectDefaults("send_key = 1", /unknown key send_key .*\[input\]/);
  });

  test("reports a table name with a value that is not a table", () => {
    expectDefaults("input = 1", /input must be a table/);
  });

  test("reports a TOML syntax error on one line", () => {
    expectDefaults("[input\nsend_key", /^config\.toml: /);
  });

  test("keeps the error text of a [status] problem", () => {
    expectDefaults('[status]\nitems = ["brnch"]', /status\.items\[0\]: unknown item "brnch"/);
  });

  test("returns the same object for the same text", () => {
    const text = '[input]\nsend_key = "ctrl-enter"';
    expect(loadConfig(text)).toBe(loadConfig(text));
  });
});
