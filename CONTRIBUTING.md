# Contributing to openRun

Thanks for helping. openRun is a self-hosted running app for runners and their clubs, and it is small enough that one change can make a real difference.

## Ways to help

- **Try it and say what's missing.** The [demo](https://openrun-demo.fly.dev) resets every night, so click anything. Open an [issue](https://github.com/stretch0/openRun/issues) for bugs or ideas.
- **Run it for your club** and tell us what got in the way.
- **Pick up an issue.** Ones labelled [`good first issue`](https://github.com/stretch0/openRun/labels/good%20first%20issue) are small and self-contained. Say on the issue that you're working on it.
- **Bigger changes:** open an issue first, so we can agree the approach before you spend time on it. [ROADMAP.md](ROADMAP.md) has what's planned, and [docs/PRIVACY.md](docs/PRIVACY.md) explains the privacy rules every feature has to follow.

Security problems go through [private reporting](SECURITY.md), not public issues.

## Getting set up

You need Node 22 or later.

```bash
npm install
npm run dev
```

The API runs on http://localhost:3000 and the web app on http://localhost:4200. The first account you create becomes the admin.

To start with sample data instead (a runner with six months of runs, and a club with members, RSVPs and coffee orders), use the demo mode with its own data folder. It **replaces everything** in the database it's pointed at, so keep it away from `./data`:

```bash
DEMO_MODE=true DATA_DIR=./data-demo npm run dev
```

Then sign in with **Try the demo**.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces fit together. In short:

| Where                 | What                                                           |
| --------------------- | -------------------------------------------------------------- |
| `apps/api`            | Hono API server, which also serves the built web app           |
| `apps/web`            | React PWA                                                      |
| `apps/web-e2e`        | Playwright tests against the production build                  |
| `libs/schemas`        | Zod request and response shapes shared by the API and web app  |
| `libs/domain`         | Pure logic (pace maths, schedules, highlights) with unit tests |
| `libs/db`             | Drizzle schema and database client                             |
| `libs/db-migrations`  | Generated SQL migrations                                       |
| `libs/activity-files` | FIT and GPX parsing                                            |

## Conventions

- Shared request and response shapes go in `libs/schemas`, and both the API and the web app use them.
- Pure logic goes in `libs/domain` with unit tests, not in routes or components.
- Schema changes: edit `libs/db/src/schema`, then run `npm run db:generate -- --name=<description>` and commit the generated SQL. Never edit a migration that's already on `main`.
- Relative imports in the Node libraries use `.js` extensions.
- Privacy first: runs are private by default, and clubs only see what a member chose to send them. If a change touches what other people can see, say so in the pull request.
- Interface text is plain and short, in British English.

## Before you open a pull request

```bash
npx nx affected -t lint typecheck test build
npm run e2e
```

CI runs these too, plus CodeQL, a dependency review and an image scan. The end-to-end tests need Playwright's Chromium (`npx playwright install chromium`), or point `CHROMIUM_PATH` at a Chromium you already have.

Keep pull requests to one change, with tests for new behaviour. Describe what changed and why, and add screenshots for anything visible. Pull requests are squash-merged into `main`.

If the change affects the screenshots, retake them from a running demo with `node scripts/screenshots.mjs <url>` (see [docs/DEMO.md](docs/DEMO.md)).

By contributing, you agree that your work is licensed under the project's [AGPL-3.0-or-later licence](LICENSE).
