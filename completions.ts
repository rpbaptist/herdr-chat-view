// Auto-complete entries for the chat input: the agent's skills (from its
// transcript) and its built-in slash commands (not in the transcript).
import { agentOf } from "./agents.ts";
import { addSkills, type Skill } from "./transcripts.ts";

export type Completion = { name: string; description: string; trigger: "/" | "$"; source: "skill" | "builtin" };

// Merge the built-in commands and the skills of an agent kind, de-duplicated by
// trigger and name. A skill replaces a built-in command with the same name.
export function completions(kind: string | null | undefined, skills: Iterable<Skill>): Completion[] {
  const agent = agentOf(kind);
  if (!agent) return [];
  const merged = new Map<string, Completion>();
  for (const b of agent.builtins) merged.set(`/${b.name}`, { ...b, trigger: "/", source: "builtin" });
  const unique = new Map<string, Skill>();
  addSkills(unique, skills);
  for (const s of unique.values()) merged.set(agent.skillTrigger + s.name, { ...s, trigger: agent.skillTrigger, source: "skill" });
  return [...merged.values()];
}
