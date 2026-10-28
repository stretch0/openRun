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

| Project              | Purpose                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| `apps/api`           | Hono server. Bundled with esbuild into one file; third-party packages stay external.  |
| `apps/web`           | React 19 + Vite PWA (`vite-plugin-pwa`), React Router, TanStack Query, Tailwind CSS 4 |
| `apps/web-e2e`       | Playwright tests run against the production build (API serving the PWA)               |
| `libs/schemas`       | Zod schemas and types shared by the API and the web app                               |
| `libs/db`            | Drizzle schema and database client                                                    |
| `libs/db-migrations` | Generated SQL migrations and the `generate` / `check` / `migrate` targets             |
| `libs/domain`        | Pure, unit-tested running logic                                                       |

Planned libs: `activity-files` (FIT/GPX parsing), `integrations/garmin`, `integrations/strava`, `mcp` (tool definitions) and `ui`. Each integration will implement a common `ActivityProvider` / `WorkoutTarget` interface.

Libraries are not buildable. They export TypeScript source, and the consuming app's bundler compiles it.

## Database and migrations

- The schema lives in `libs/db/src/schema`.
- Migrations live in their own Nx project, `libs/db-migrations`. Because of that:
  - `nx affected -t check` and `nx affected -t migrate` only run when the schema or the migrations change.
  - `check` fails CI if the schema changed without a migration.
  - `apps/api` has an implicit dependency on `db-migrations`, so a new migration also rebuilds the image.
- On startup the API applies pending migrations. Drizzle's migrator tracks them in `__drizzle_migrations` and does nothing when nothing is pending, so upgrading a self-hosted instance is just pulling a new image.
- Never edit a migration once it has been released.

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
