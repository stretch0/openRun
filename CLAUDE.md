# openRun

Self-hosted running app (run log, training plans, run clubs, Garmin sync, MCP). Read `docs/ARCHITECTURE.md` first; `ROADMAP.md` has the milestones.

## Project conventions

- Shared request/response shapes go in `libs/schemas` (Zod) and are used by both `apps/api` and `apps/web`.
- Pure logic (maths, plan generation, recurrence) goes in `libs/domain` with unit tests, not in routes or components.
- Schema changes: edit `libs/db/src/schema`, then run `npx nx run db-migrations:generate --name=<description>` and commit the generated SQL. Never hand-edit or change released migrations. `npx nx run db-migrations:check` must pass.
- Relative imports in Node/TS libs use `.js` extensions (`nodenext`).
- E2E tests run against the production build; locally pass `CHROMIUM_PATH` if Playwright's bundled browser isn't installed.

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `npx nx build`) - avoids using globally installed CLI
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools
