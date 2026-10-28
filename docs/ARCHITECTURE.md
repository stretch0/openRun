# Architecture

## Overview

openRun ships as **one Docker image**. A Node API built with [Hono](https://hono.dev) serves both `/api` and the built PWA, so passkeys and cookies work on a single origin. Data lives in **SQLite** at `/data/openrun.db`, next to uploaded files.

```
browser / installed PWA ──► api (Hono, Node 22) ──► SQLite (/data)
                              ├─ /api/auth/*   Better Auth (password, passkeys)
                              ├─ /api/*        app routes
                              ├─ /mcp          MCP server (M4)
                              └─ /*            built PWA (apps/web/dist)
```

## Monorepo layout

| Project               | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `apps/api`            | Hono server. Bundled with esbuild into one file; third-party packages stay external.  |
| `apps/web`            | React 19 + Vite PWA (`vite-plugin-pwa`), React Router, TanStack Query, Tailwind CSS 4 |
| `apps/web-e2e`        | Playwright tests run against the production build (API serving the PWA)               |
| `libs/schemas`        | Zod schemas and types shared by the API and the web app                               |
| `libs/db`             | Drizzle schema and database client                                                    |
| `libs/db-migrations`  | Generated SQL migrations and the `generate` / `check` / `migrate` targets             |
| `libs/domain`         | Pure, unit-tested running logic: units, streams, splits, best efforts                 |
| `libs/activity-files` | FIT and GPX parsing into one device-neutral activity shape (Node only)                |

Planned libs: `integrations/garmin`, `integrations/strava`, `mcp` (tool definitions) and `ui`. Each integration will implement a common `ActivityProvider` / `WorkoutTarget` interface.

Libraries are not buildable. They export TypeScript source, and the consuming app's bundler compiles it.

## Database and migrations

- The schema lives in `libs/db/src/schema`.
- Migrations live in their own Nx project, `libs/db-migrations`. Because of that:
  - `nx affected -t check` and `nx affected -t migrate` only run when the schema or the migrations change.
  - `check` fails CI if the schema changed without a migration.
  - `apps/api` has an implicit dependency on `db-migrations`, so a new migration also rebuilds the image.
- On startup the API applies pending migrations. Drizzle's migrator tracks them in `__drizzle_migrations` and does nothing when nothing is pending, so upgrading a self-hosted instance is just pulling a new image.
- Never edit a migration once it has been released.

## Activities

- Imports are parsed by `libs/activity-files`. Each file's SHA-256 is stored as `external_id`, so re-uploading a file is a no-op. A run that starts within a minute of an existing one and is within 5% of its distance also counts as a duplicate (the same run as FIT and GPX, or synced and uploaded).
- The original file is kept at `DATA_DIR/files/<user id>/<activity id>.<fit|gpx>[.gz]` and can be downloaded again.
- Samples are stored per activity in `activity_stream` as gzipped column-wise JSON. The API downsamples them for maps and charts and computes splits from them in the user's units.
- `personal_best` holds the fastest effort over each standard distance _per activity_. A PB is a user's fastest row, so deleting or editing an activity needs no recalculation. Walks and other non-running sports don't get efforts.

- Stats (`/api/stats`) count running sports only. Periods use the user's time zone, weeks start on Monday, and race predictions use the best VDOT from efforts of a mile or more in the last 120 days.
- Shoe mileage is the shoe's starting distance plus every run logged in it. Deleting a shoe keeps its runs.
- `/api/export/activities.json` and `.csv` export runs, laps, best efforts and shoes. CSV cells that a spreadsheet would treat as formulas are prefixed with an apostrophe.

## Privacy

The rules are in [PRIVACY.md](PRIVACY.md). How they're implemented:

- Runs, streams, PBs and shoes are only ever queried with the signed-in user's id. Admin routes cover invites only.
- `activity.visibility` is `private` (the default) or `clubs`. New runs take the user's `privacy_settings.default_visibility`; a missing settings row means the defaults.
- A `privacy_zone` keeps the circle the user drew (`lat`, `lng`, `radius_m`) and a randomised circle (`trim_*`) chosen once when it's created. Only the randomised one is used for trimming, and it's never sent to the browser.
- `sharedStream()` in `apps/api/src/privacy.ts` is the one place that turns a stream into what others may see: no positions unless the owner shares maps, and none inside a zone. `GET /api/activities/:id/stream?view=shared` lets the owner preview it; M2 will use the same function.
- Passwords are reset only with `reset-password.js` (`apps/api/src/reset-password.ts`, built next to `main.js`). It sets a temporary password and deletes the user's sessions.

## Auth

- [Better Auth](https://better-auth.com) handles email + password and passkeys (`@better-auth/passkey`). Sessions use cookies.
- The first account becomes `admin` (`FIRST_USER_ADMIN`).
- With `INVITE_ONLY=true`, sign-up needs an unused, unexpired invite code. If the invite has an email, the address must match. Admins create invites in the app.
- Better Auth rate-limits by client IP. Unless `TRUST_PROXY` is set, the API overwrites `X-Forwarded-For` with the socket address so clients can't spoof it.
- MCP clients (M4) will use hashed personal access tokens (`api_token` table) with read or write scope.

## PWA

- `vite-plugin-pwa` generates the manifest and a Workbox service worker.
- Navigation falls back to `index.html`.
- `GET /api/*` requests (but not auth) use network-first caching, so the last data seen is still available offline.
- When a new version is deployed, an in-app prompt offers a reload.
- Hashed assets are cached forever. HTML and the service worker are always revalidated.

## Integrations (planned)

- **Garmin:** Garmin has no public consumer API, so we use the community approach (as in `garmin-connect`), behind an adapter and marked unofficial. FIT upload and Strava are always available as alternatives.
- **Runna:** has no API. Runna pushes workouts to the Garmin calendar, so openRun reads them from there.
- **Weather:** Open-Meteo. **Maps:** MapLibre with OSM tiles. Neither needs an API key.
