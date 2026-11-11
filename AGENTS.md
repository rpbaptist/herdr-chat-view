# AGENTS.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `rpbaptist/herdr-chat-view` (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Development process

Make each change in its own worktree, on a new branch from `origin/main`. Open a PR for each change. Do not commit to `main`.

- **Language guides**: TypeScript: `docs/agents/typescript.md`. The guide has the checks before a commit.

## Skills

- verify: before you report a change to `herdr-chat.ts`, `transcripts.ts` or `index.html` as done, prove it with `verify` (`.agents/skills/verify/SKILL.md`). It drives the real plugin in an isolated herdr session and keeps the evidence. `.claude/skills/verify` is a symlink to the same directory.
