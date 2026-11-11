import { describe, expect, test } from "bun:test";
import { loadConfig, pageSettings, updateConfig } from "./config.ts";

const which = (bin: string) => (bin === "voxtype" ? "/usr/bin/voxtype" : null);
const settings = (text: string | null) => pageSettings(loadConfig(text), which);
const STATUS_DEFAULTS = { mode: true, hide: [], items: ["*"], builtins: ["kind", "cwd", "status", "branch"] };

describe("pageSettings status", () => {
  test("gives the [status] strings as written, and the built-in names", () => {
    const text = '[status]\nmode = false\nhide = ["/\\\\d+% context/i"]\nitems = ["branch", "/^⎇/", "*"]';
    expect(settings(text)).toMatchObject({
      status: { mode: false, hide: ["/\\d+% context/i"], items: ["branch", "/^⎇/", "*"], builtins: STATUS_DEFAULTS.builtins },
      error: null,
    });
  });

  test("gives the defaults and the error line for a file with an error", () => {
    const s = settings('[status]\nhide = ["/(oops/"]');
    expect(s.status).toEqual(STATUS_DEFAULTS);
    expect(s.error).toMatch(/^config\.toml: status\.hide\[0\]/);
  });
});


describe("loadConfig", () => {
  test("gives the defaults when the file is missing", () => {
    const c = loadConfig(null);
    expect(c.error).toBeNull();
    expect(c.input).toEqual({ sendKey: "enter" });
    expect(c.status.mode).toBe(true);
    expect(pageSettings(c, which)).toEqual({ sendKey: "enter", themeMode: "auto", status: STATUS_DEFAULTS, error: null, voice: { tool: "voxtype" } });
  });

  test("gives the defaults for an empty file", () => {
    expect(loadConfig("")).toEqual(loadConfig(null));
  });

  test("reads send_key from [input]", () => {
    expect(settings('[input]\nsend_key = "ctrl-enter"').sendKey).toBe("ctrl-enter");
    expect(settings('[input]\nsend_key = "enter"').sendKey).toBe("enter");
  });

  test("reads tool from [voice]", () => {
    expect(settings('[voice]\ntool = "off"').voice).toBeNull();
    expect(settings('[voice]\ntool = "voxtype"').voice).toEqual({ tool: "voxtype" });
    expect(pageSettings(loadConfig(null), () => null).voice).toEqual({ tool: null, reason: expect.stringMatching(/voxtype/) });
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

  test("reports a bad [voice] tool and uses the defaults", () => {
    expectDefaults('[voice]\ntool = "monologue"', /voice\.tool must be/);
  });

  test("reports an unknown key in [input]", () => {
    expectDefaults('[input]\nsendkey = "enter"', /unknown key input\.sendkey/);
  });

  test("reports an error in [input] next to a valid [status] and uses all defaults", () => {
    expectDefaults('[status]\nmode = false\n[input]\nsend_key = "x"', /input\.send_key/);
  });

  test("reports an unknown table", () => {
    expectDefaults("[colors]\nbg = 3", /unknown table colors \(use \[status\] or \[input\] or \[font\] or \[theme\] or \[voice\]\)/);
  });

  test("reads [font] next to the other tables", () => {
    const c = loadConfig('[font]\nsans = "terminal"\nsize = 16\n[input]\nsend_key = "ctrl-enter"');
    expect(c.font).toEqual({ sans: "terminal", mono: null, size: 16, monoSize: 13 });
    expect(c.input.sendKey).toBe("ctrl-enter");
  });

  test("reports a bad [font] value and uses the defaults", () => {
    expectDefaults("[font]\nsize = 2", /font\.size must be a number from 8 to 40/);
    expectDefaults('[status]\nmode = false\n[font]\nmono = "a;b"', /font\.mono: bad font name "a;b"/);
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

describe("theme mode", () => {
  test("reads mode from [theme]", () => {
    expect(loadConfig(null).theme).toEqual({ mode: "auto" });
    expect(settings('[theme]\nmode = "light"').themeMode).toBe("light");
  });

  test("reports a bad mode", () => {
    expect(loadConfig('[theme]\nmode = "sepia"').error).toMatch(/theme\.mode must be "auto", "dark" or "light"/);
    expect(loadConfig("[theme]\nname = 1").error).toMatch(/unknown key theme\.name/);
  });
});

describe("updateConfig", () => {
  test("sets a key and keeps the rest", () => {
    const text = '# mine\n[input]\nsend_key = "enter"\n';
    expect(updateConfig(text, "theme", "mode", "dark")).toBe(`${text}\n[theme]\nmode = "dark"\n`);
  });

  test("makes the file from nothing", () => {
    expect(updateConfig(null, "theme", "mode", "light")).toBe('[theme]\nmode = "light"\n');
  });

  test("refuses an unknown table, an unknown key and a bad value", () => {
    expect(() => updateConfig("", "colors", "mode", "dark")).toThrow(/unknown table colors/);
    expect(() => updateConfig("", "theme", "name", "dark")).toThrow(/unknown key theme\.name/);
    expect(() => updateConfig("", "theme", "mode", "sepia")).toThrow(/theme\.mode must be/);
    expect(() => updateConfig("", "font", "size", 99)).toThrow(/font\.size/);
  });

  test("refuses a write to a file that has an error", () => {
    expect(() => updateConfig("[input]\nsend_key = 1", "theme", "mode", "dark")).toThrow(/input\.send_key/);
  });

  test("takes list values for [status]", () => {
    expect(updateConfig('[status]\nmode = true\n', "status", "hide", ["/x/"])).toBe('[status]\nmode = true\nhide = ["/x/"]\n');
  });
});
