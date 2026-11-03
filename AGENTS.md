# Instructions for AI agents

These instructions apply to the entire repository.

## Required context workflow

1. Read `PROJECT_CONTEXT.md` before planning or editing. Inspect the relevant source too; the context is a maintained map, not a substitute for the code.
2. Check `git status --short` before changing files. Preserve existing staged and unstaged work unless the user explicitly requests otherwise.
3. **After each coherent change, update `PROJECT_CONTEXT.md` in the same change set, before moving to unrelated work or declaring the task complete.** This includes code, tests, dependencies, configuration, operational data, documentation, and agent-instruction changes. Do not defer updates to a later task or commit.
4. Update the affected current-state sections and append a dated change-log entry stating what changed, why, validation results, and remaining limitations. For a change with no architectural effect, explicitly record that fact. Editing the context itself needs only its own entry, not a recursive update.
5. Before handoff, compare the final diff with the context. Remove stale statements, distinguish observed behavior from intended behavior, and record failed or unavailable checks honestly. Do not claim tests passed when no tests ran.
6. If work is interrupted, record the completed work and outstanding steps in the context before handing off where possible.

**Definition of done:** implementation and relevant verification are complete, `PROJECT_CONTEXT.md` reflects the resulting repository, and its change log accounts for the change. A task is incomplete without the context update. This requirement remains in force for future development; retain it when reorganizing documentation or instructions. Any nested agent instructions must preserve it.

## Project-specific guardrails

- Never copy `.env` values, passwords, access/refresh tokens, private topic names, or real account identifiers into documentation, tests, logs, or commits. Use placeholders and mocked services.
- `src/index.ts` starts the real scheduler as an import side effect. Do not import or execute it for inspection or routine validation. `npm run book` can make real bookings and publish notifications; use mocked dependencies for tests.
- Keep preparation separate from the actual booking attempt. Preserve Sofia calendar/time-zone semantics and explicitly verify timing, DST, skips, and retry behavior when changing scheduling.
- Use the existing TypeScript ESM conventions (`.js` suffixes in source imports). Edit `src/`, not generated `dist/` or `node_modules/`.
- Run checks appropriate to the change; document exact results in the context. Do not restore, delete, stage, or commit someone else's pending changes as part of routine cleanup.

This file supplies repository-level instructions to agents that support `AGENTS.md`. It is a procedural requirement, not an installed Git hook or CI enforcement mechanism. Do not claim that automation enforces it.
