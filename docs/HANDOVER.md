# Handover notes (end of M0)

## Context

openRun is an open-source, self-hosted running app: run log, training plans, run clubs with RSVPs and coffee orders, Garmin/Strava sync and an MCP server. It is inspired by DuarteSantos8/openGym.

The previous session planned the product and built **M0 (foundation)**. You're picking it up in a new session that has a test environment. The repo is `stretch0/openRun`. All work is on branch **`claude/kind-dirac-4e0hkb`**, single commit `d8861d6 Scaffold openRun M0 foundation`. There is **no `main` branch yet** and no PR.

Read first, in this order: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `ROADMAP.md`, `README.md`.

## Decisions already made (don't re-litigate)

- **Users:** one instance serves many users (for example a club hosts it). Personal use is just the one-user case.
- **Monorepo:** TypeScript Nx monorepo (Nx **23.3.1**, pinned exactly) with npm workspaces covering `apps/*`, `libs/*` and `libs/integrations/*`.
- **Stack:** Hono API, React 19 + Vite PWA, SQLite through better-sqlite3 + Drizzle, Better Auth for password and passkey sign-in.
- **Deployment:** a single Docker image in which the API serves the built PWA. Data lives in the `/data` volume.
- **Migrations:** kept in their own Nx lib (`libs/db-migrations`) so `nx affected` only runs migration targets when the schema changes. This was the user's explicit request.
- **v0.1 scope** is M0 to M4: foundation, run log, run clubs, Garmin/Strava sync, then plans and MCP. Suggested order is M1, then M2, then M3, then M4.
- **Licence:** AGPL-3.0-or-later. Tentative; the user may prefer MIT.
- **Garmin:** it has no public consumer API. Use the unofficial `garmin-connect`-style approach behind an adapter, with FIT upload and Strava as fallbacks.
- **Runna:** it has no API. Read its workouts from the Garmin calendar.
- **hot-choccy** (stretch0/hot-choccy) turned out to be an empty Nx scaffold. Only its feature idea carries over: RSVP, coffee order, weather and attendance streak. The run club data model has to be designed fresh in M2. A draft is in `docs/ARCHITECTURE.md` and below.

## What exists (M0)

| Path                                               | What                                                                                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                                         | Hono server. See the API notes below.                                                                                                                                                              |
| `apps/web`                                         | React PWA. See the web notes below.                                                                                                                                                                |
| `apps/web-e2e`                                     | Playwright tests against the production build. See the testing section.                                                                                                                            |
| `libs/db`                                          | Drizzle schema in `src/schema/{auth,runs,columns}.ts`, plus `createDb()` and `runMigrations()` in `src/client.ts`                                                                                  |
| `libs/db-migrations`                               | `migrations/0000_init.sql` and `drizzle.config.ts`. Targets: `generate`, `check` (`scripts/check.mjs`, fails on schema drift), `migrate`, `test` (applies all migrations to an in-memory database) |
| `libs/schemas`                                     | Zod contract shared by the API and web: `me`, `updateMe`, `instanceInfo`, `invite`, `createInvite`                                                                                                 |
| `libs/domain`                                      | Pure maths in `units.ts`: pace, distance and duration formatting                                                                                                                                   |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | Image build and self-hosting setup                                                                                                                                                                 |
| `.github/workflows/ci.yml`, `docker.yml`           | CI (`nx affected` for check, lint, typecheck, test, build and e2e) and multi-arch publish to GHCR. **Never run on GitHub yet.**                                                                    |

**API (`apps/api`)**

- `config.ts` reads environment variables with Zod.
- `auth.ts` sets up Better Auth with passkeys. Its database hook makes the first user admin and enforces single-use, optionally email-bound invites when `INVITE_ONLY` is set.
- `app.ts` holds the routes and serves the PWA with an SPA fallback.
- `routes/{instance,me,admin}.ts`: `/api/health`, `/api/instance`, `/api/me` (GET/PATCH), `/api/admin/invites`.
- `context.ts` has the `requireUser` and `requireAdmin` middleware.
- esbuild bundles the workspace libs and leaves npm packages external.
- `nx run api:prune` writes a pruned `package.json` and lockfile to `apps/api/dist`.

**Web (`apps/web`)**

- Pages: login (password + passkey), register (first-user setup and invite code from `?invite=`), home (placeholder), settings (profile, passkeys, install, sign out), admin invites.
- `vite-plugin-pwa` handles the manifest, the Workbox service worker and NetworkFirst caching of `GET /api/*` (auth routes excluded).
- `UpdatePrompt` and `InstallButton` cover updating and installing the app.

**DB tables in place:** user (with role, units, timezone), session, account, verification, passkey, invite, api_token, shoe, activity, activity_stream, lap, personal_best. **No run club tables yet.**

## Running and testing

```bash
npm install
npm run dev
```

`npm run dev` starts the API on :3000 and Vite on :4200; Vite proxies `/api`. The dev database is `./data/openrun.db`, which is gitignored.

Run everything once:

```bash
npx nx run-many -t lint typecheck test build check
```

End-to-end tests:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npx nx e2e web-e2e
```

- The e2e run builds the API and web, then starts the API on :3100 with a fresh temporary `DATA_DIR`.
- Set `CHROMIUM_PATH` only when Playwright's bundled browser isn't installed.

Docker:

```bash
docker build -t openrun:dev .
```

```bash
docker run -p 3000:3000 -e BETTER_AUTH_SECRET=$(openssl rand -base64 32) -v ./data:/data openrun:dev
```

Then open http://localhost:3000. The first sign-up becomes admin.

Schema change workflow:

1. Edit `libs/db/src/schema`.
2. Run `npx nx run db-migrations:generate --name=<description>` and commit the SQL.
3. `check` must pass.
4. Never edit `0000_init.sql` once released.

**Last verified state:**

- Lint, typecheck, test, build and check pass for all 7 projects.
- Unit and API tests: 11 passing.
- E2E: 3 passing.
- The Docker image was built and run locally. Migrations ran on boot, the SPA and service worker were served, data persisted across a restart, and it runs as the non-root `node` user.

## Gotchas found the hard way

- **npm/Nx versions:** npm 10 crashed with `edgesOut` because Nx package versions were mixed. Keep every `nx` and `@nx/*` package at **exactly the same version**, with no `^`.
- **Playwright config:** it must not import `@nx/devkit` or `@nx/playwright/preset`, because Nx's native module fails inside Playwright's config loader. The config is standalone on purpose.
- **tsconfig `outDir`:** app tsconfigs use `outDir: out-tsc`, not `dist`. Sharing `dist` with Vite or esbuild broke typecheck (TS6305).
- **api build:** `generatePackageJson` is not supported with this TS setup; use the `prune` target.
- **Docker build stage:** uses `node:22-bookworm`, which has python3, make and g++, because better-sqlite3 may need compiling. The runtime stage is `-slim`.
- **Docker in the old sandbox:**
  - The daemon wasn't running; start it with `dockerd &`.
  - Docker Hub returned 429, so `mirror.gcr.io/library/node` worked instead.
  - `npm ci` inside the build needed the agent proxy's CA and `--network host`.
  - None of these workarounds are committed. A normal environment shouldn't need them.
- **Client IP:** unless `TRUST_PROXY=true`, `app.ts` overwrites `X-Forwarded-For` with the socket address, because Better Auth rate-limits on that header.
- **Origins in development:** non-production mode automatically trusts `http://localhost:4200`, so passkeys work through the Vite proxy.
- **Passkeys need HTTPS** except on localhost.

## Known gaps and TODO

- **Never exercised for real:**
  - The CI and Docker publish workflows have never run on GitHub.
  - The arm64 image has never been built.
  - Passkey registration and sign-in have never been tested in a real browser; e2e only covers password sign-in.
- **The repo has no `main` branch.** Ask the user whether to create `main` from this branch or open a PR.
- **Image size:** runtime node_modules is about 250MB uncompressed and could be trimmed.
- **Deferred from the plan:**
  - Typed API client (Hono RPC); the web currently uses `fetch` plus the shared Zod schemas.
  - TanStack Query cache saved to IndexedDB.
  - `libs/ui`, `libs/activity-files`, `libs/integrations/*` and `libs/mcp`. Create them with the `nx-generate` skill when their milestone starts.
- **Home page** is a placeholder listing the upcoming features.

## Suggested first steps in the new environment

1. Check out `claude/kind-dirac-4e0hkb`, run `npm install`, then `npx nx run-many -t lint typecheck test build check` and the e2e tests.
2. Build and run the Docker image normally, without the sandbox workarounds, and confirm a clean first boot.
3. In a real browser, register, add a passkey, sign out and sign back in with it. Install the PWA. Create an invite and use it with `INVITE_ONLY=true`.
4. Agree with the user how this branch reaches `main`. After that, CI runs for real.
5. Start **M1 (run log)**:
   - Create `libs/activity-files` for FIT (fit-file-parser) and GPX parsing.
   - Add upload and manual-entry routes and an activity list and detail page (MapLibre + OSM).
   - Add PB detection in `libs/domain`.
   - Tables already exist; add a migration if the schema changes.

## Draft run club model (M2)

- **club:** name, description, visibility, join code.
- **club_member:** role is owner, organiser or member.
- **club_location:** lat/lng and meeting-point notes.
- **club_run_series:** RRULE, default location, pace groups, and an order cutoff in minutes.
- **club_run:** dated runs created ahead of time from the series, so each one can be edited or cancelled.
- **rsvp:** going, maybe or no, plus pace group and guests.
- **menu_item:** a club's café menu, with options.
- **coffee_order:** rsvp, item, options and note, plus a saved "usual" per user.
- **checkin:** feeds the attendance streak.
- **Jobs:** an in-process scheduler (croner) runs order cutoff and summary, Web Push reminders (VAPID) and Open-Meteo weather lookups.
