# TypeScript

The checks before a commit. CI runs the same checks on each PR.

1. Install the dependencies: `bun install --frozen-lockfile`.
2. Run the unit tests: `bun test`. All tests must pass.

The repo has no type check and no linter. Bun runs the TypeScript files directly.
