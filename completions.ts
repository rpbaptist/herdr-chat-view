// Auto-complete entries for the chat input: the agent's skills (from its
// transcript) and its built-in slash commands (not in the transcript).
import type { Skill } from "./transcripts.ts";

export type Completion = { name: string; description: string; trigger: "/" | "$"; source: "skill" | "builtin" };

const list = (entries: [string, string][]): Skill[] => entries.map(([name, description]) => ({ name, description }));

const builtins: Record<string, Skill[]> = {
  claude: list([
    ["add-dir", "Add a working directory"],
    ["agents", "Manage agent configurations"],
    ["bug", "Report a bug"],
    ["clear", "Clear the conversation history"],
    ["compact", "Clear the history but keep a summary in context"],
    ["config", "Open the settings"],
    ["context", "Show the context usage"],
    ["cost", "Show the token usage of this session"],
    ["doctor", "Check the health of the installation"],
    ["exit", "Exit Claude Code"],
    ["export", "Export the conversation"],
    ["fast", "Turn fast mode on or off"],
    ["help", "Show help"],
    ["hooks", "Manage hook configurations"],
    ["ide", "Manage IDE integrations"],
    ["init", "Write a CLAUDE.md for this codebase"],
    ["install-github-app", "Set up Claude GitHub Actions for a repository"],
    ["login", "Sign in"],
    ["logout", "Sign out"],
    ["mcp", "Manage MCP servers"],
    ["memory", "Edit the memory files"],
    ["model", "Set the AI model"],
    ["output-style", "Set the output style"],
    ["permissions", "Manage tool permission rules"],
    ["plugin", "Manage plugins"],
    ["privacy-settings", "View and update the privacy settings"],
    ["pr-comments", "Get the comments of a GitHub pull request"],
    ["release-notes", "Show the release notes"],
    ["resume", "Resume a conversation"],
    ["review", "Review a pull request"],
    ["rewind", "Restore the code or the conversation to an earlier point"],
    ["sandbox", "Turn sandbox mode on or off"],
    ["security-review", "Review the pending changes for security issues"],
    ["status", "Show the version, model, account and connectivity"],
    ["statusline", "Set up the status line"],
    ["terminal-setup", "Install the Shift+Enter key binding"],
    ["theme", "Change the color theme"],
    ["todos", "List the current todo items"],
    ["upgrade", "Upgrade the plan"],
    ["usage", "Show the plan usage limits"],
    ["vim", "Turn Vim editing mode on or off"],
  ]),
  codex: list([
    ["compact", "Summarize the conversation to free context"],
    ["diff", "Show the git diff, including untracked files"],
    ["exit", "Exit Codex"],
    ["feedback", "Send feedback to the maintainers"],
    ["fork", "Fork the current conversation"],
    ["init", "Create an AGENTS.md file with instructions for Codex"],
    ["logout", "Sign out of Codex"],
    ["mcp", "List the configured MCP tools"],
    ["mention", "Mention a file"],
    ["model", "Choose the model and reasoning effort"],
    ["new", "Start a new chat"],
    ["permissions", "Choose what Codex is allowed to do"],
    ["quit", "Exit Codex"],
    ["resume", "Resume a previous session"],
    ["review", "Review the changes and find issues"],
    ["skills", "List the available skills"],
    ["status", "Show the current session configuration"],
  ]),
};

const skillTrigger: Record<string, Completion["trigger"]> = { claude: "/", codex: "$" };

// Merge the built-in commands and the skills of an agent kind, de-duplicated by
// trigger and name. A skill replaces a built-in command with the same name.
export function completions(kind: string | null | undefined, skills: Iterable<Skill>): Completion[] {
  const trigger = kind ? skillTrigger[kind] : undefined;
  if (!trigger) return [];
  const merged = new Map<string, Completion>();
  for (const b of builtins[kind!] ?? []) merged.set(`/${b.name}`, { ...b, trigger: "/", source: "builtin" });
  for (const s of skills) {
    const key = trigger + s.name;
    const prev = merged.get(key);
    if (prev?.source === "skill" && !s.description) continue;
    merged.set(key, { name: s.name, description: s.description, trigger, source: "skill" });
  }
  return [...merged.values()];
}
