import { describe, expect, test } from "bun:test";
import { branchCache } from "./branches.ts";

const setup = (branch = "main") => {
  let time = 0;
  const calls: string[] = [];
  const release: (() => void)[] = [];
  const run = (cwd: string) => {
    calls.push(cwd);
    return new Promise<string>((resolve) => release.push(() => resolve(branch)));
  };
  const finish = async () => {
    release.splice(0).forEach((r) => r());
    await Bun.sleep(0);
  };
  return { cache: branchCache(run, () => time, 3000), calls, finish, advance: (ms: number) => (time += ms) };
};

describe("branchCache", () => {
  test("returns an empty branch while git runs, then the branch", async () => {
    const { cache, finish } = setup();
    expect(cache.get("/a")).toBe("");
    await finish();
    expect(cache.get("/a")).toBe("main");
  });

  test("starts no second process for a directory while one runs", async () => {
    const { cache, calls, finish, advance } = setup();
    cache.get("/a");
    advance(10_000);
    cache.get("/a");
    expect(calls).toEqual(["/a"]);
    await finish();
  });

  test("uses the cache inside the ttl and refreshes after it", async () => {
    const { cache, calls, finish, advance } = setup();
    cache.get("/a");
    await finish();
    advance(2000);
    expect(cache.get("/a")).toBe("main");
    expect(calls).toHaveLength(1);
    advance(1000);
    expect(cache.get("/a")).toBe("main");
    expect(calls).toHaveLength(2);
    await finish();
  });

  test("caches each directory apart", async () => {
    const { cache, calls, finish } = setup();
    cache.get("/a");
    cache.get("/b");
    expect(calls).toEqual(["/a", "/b"]);
    await finish();
  });

  test("a failed run gives an empty branch", async () => {
    const cache = branchCache(() => Promise.reject(new Error("no git")), () => 0);
    cache.get("/a");
    await Bun.sleep(0);
    expect(cache.get("/a")).toBe("");
  });
});
