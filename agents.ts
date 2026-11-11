// One descriptor for each agent kind. A new kind is one new entry.
import { homedir } from "node:os";
import { Glob } from "bun";
import { claudeSkills, codexSkills, parseClaude, parseCodex, type Parser, type Skill, type SkillParser } from "./transcripts.ts";

export type Agent = {
  parse: Parser;
  parseSkills: SkillParser;
  skillTrigger: "/" | "$";
  builtins: Skill[];
  transcriptGlob: { root: string; pattern: (session: string) => string };
};

const home = homedir();

const list = (entries: [string, string][]): Skill[] => entries.map(([name, description]) => ({ name, description }));

const CLAUDE_BUILTINS = list([
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
]);

const CODEX_BUILTINS = list([
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
]);

export const agents: Record<string, Agent> = {
  claude: {
    parse: parseClaude,
    parseSkills: claudeSkills,
    skillTrigger: "/",
    builtins: CLAUDE_BUILTINS,
    transcriptGlob: { root: `${home}/.claude/projects`, pattern: (s) => `*/${s}.jsonl` },
  },
  codex: {
    parse: parseCodex,
    parseSkills: codexSkills,
    skillTrigger: "$",
    builtins: CODEX_BUILTINS,
    transcriptGlob: { root: `${home}/.codex/sessions`, pattern: (s) => `**/rollout-*-${s}.jsonl` },
  },
};

export const agentOf = (kind: string | null | undefined): Agent | undefined => (kind && Object.hasOwn(agents, kind) ? agents[kind] : undefined);

const pathCache = new Map<string, string>();

// Find the transcript file for an agent kind and session ID.
export async function transcriptPath(kind: string, session: string): Promise<string | null> {
  const agent = agentOf(kind);
  if (!agent || !/^[\w-]+$/.test(session)) return null;
  const key = `${kind}:${session}`;
  const cached = pathCache.get(key);
  if (cached && (await Bun.file(cached).exists())) return cached;
  let found: string | null = null;
  try {
    const { root, pattern } = agent.transcriptGlob;
    for await (const f of new Glob(pattern(session)).scan({ cwd: root, absolute: true, onlyFiles: true })) {
      found = f;
      break;
    }
  } catch {}
  if (found) pathCache.set(key, found);
  return found;
}
