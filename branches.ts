// The git branch of a working directory, cached so the status tick never waits for git.
export type RunBranch = (cwd: string) => Promise<string>;

export const gitBranch: RunBranch = async (cwd) => {
  const proc = Bun.spawn(["git", "-C", cwd, "branch", "--show-current"], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
  const out = await new Response(proc.stdout).text();
  return (await proc.exited) === 0 ? out.trim() : "";
};

// get() returns the cached branch ("" while unknown) and starts one refresh per directory when the entry is older than ttlMs.
export function branchCache(run: RunBranch = gitBranch, now: () => number = Date.now, ttlMs = 3000) {
  const entries = new Map<string, { branch: string; at: number }>();
  const running = new Set<string>();
  return {
    get(cwd: string): string {
      const entry = entries.get(cwd);
      if (!running.has(cwd) && (!entry || now() - entry.at >= ttlMs)) {
        running.add(cwd);
        run(cwd)
          .catch(() => "")
          .then((branch) => entries.set(cwd, { branch, at: now() }))
          .finally(() => running.delete(cwd));
      }
      return entry?.branch ?? "";
    },
  };
}
