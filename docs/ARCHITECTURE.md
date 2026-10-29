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

## Clubs

- The club code lives in `apps/api/src/clubs/` and never touches run-log tables; a test (`clubs.spec.ts`) fails if it does. Members' names are shared with fellow members; emails never are.
- Repeating runs are stored as a weekly RRULE subset plus a local start time and the club's time zone. `libs/domain/src/schedule.ts` turns them into instants, handling clock changes (a skipped time moves later; a repeated time uses the first).
- Runs exist eight weeks ahead in `club_run`, created on demand when a club or its runs are viewed (`ensureUpcomingRuns`, safe to repeat thanks to a unique index on series and start time). Editing a series updates future runs, removes ones no longer on the schedule and keeps RSVPs on the rest. A scheduler arrives with reminders in M2 part 3.
- Someone who leaves a club, or is removed, takes their RSVPs, coffee orders and usual with them.
- **Coffee** (`apps/api/src/clubs/coffee.ts`, pure logic in `libs/domain/src/coffee.ts`): organisers keep a café menu (items with optional single-choice options, hidden rather than deleted). Members who are going order one item per run; the item name and choices are copied into the order, so menu edits never rewrite orders. Orders lock `order_cutoff_min` before the start (set per series, copied to each run). Saying anything other than "going" removes the order; saying "going" adds the member's usual if they turned that on. Any active member can open the order list (`GET …/runs/:runId/orders`); the run page fetches it ahead of time so the service worker's API cache has it for the café, and the page holds a screen wake lock.
- **Sharing runs** (`apps/api/src/clubs/shares.ts`): the run log side (`routes/activities.ts`, `PUT /api/activities/:id/clubs/:clubId`) builds a snapshot and passes it in, with the route only as a callback the club side calls when the member's level is `full` (and the route comes from `sharedStream`, so it's privacy-zoned and empty unless map sharing is on). Shares are unique per club and run, matched to a club run within 90 minutes, and survive the original being edited or deleted. Withdrawn by the member, by making the run (or all runs) private, or by leaving the club.
- **Highlights** (`GET /api/clubs/:id/highlights`, logic in `libs/domain/src/highlights.ts`): attendance is a "going" RSVP to a run that went ahead. Weekly streaks (a streak survives until a whole week is missed), milestones at 1, 10, 25, 50… runs and rainy runs from the last 30 days, for members with `club_member.highlights` on; the month's turnout and shared distance count everyone and name nobody.
- Edit schemas are built with `editSchema()` in `libs/schemas`, not Zod's `.partial()`, which keeps defaults and would reset fields an edit didn't send.
- Meeting point search (`GET /api/places`) proxies a Nominatim-compatible geocoder (`PLACE_SEARCH_URL`, empty to turn it off). Requests are queued to one a second and results cached in memory, as Nominatim's public usage policy asks; the app searches on submit, never as you type.

## Auth

- [Better Auth](https://better-auth.com) handles email + password and passkeys (`@better-auth/passkey`). Sessions use cookies.
- The first account becomes `admin` (`FIRST_USER_ADMIN`).
- With `INVITE_ONLY=true`, sign-up needs an unused, unexpired invite code. If the invite has an email, the address must match. Admins create invites in the app.
- Better Auth rate-limits by client IP. Unless `TRUST_PROXY` is set, the API overwrites `X-Forwarded-For` with the socket address so clients can't spoof it.
- MCP clients (M4) will use hashed personal access tokens (`api_token` table) with read or write scope.

## Notifications and the scheduler

- `apps/api/src/scheduler.ts` runs jobs inside the server with `croner`: reminders and coffee nudges every minute, weather every 30 minutes (a run's forecast refreshes when it's over 3 hours old), and runs created eight weeks ahead nightly. Each job catches its own errors. It starts in `main.ts`, not `createApp`, so tests drive the job functions directly with a fixed `now`.
- `apps/api/src/push.ts`: Web Push with VAPID keys from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, or generated once into `DATA_DIR/vapid.json`. `Notifier.notify(userIds, notification, key?)` sends to every subscribed device and deletes subscriptions the push service says are gone; with a `key` (e.g. `reminder:<run id>`) it claims a `notification_sent` row first, so each person gets it at most once even across restarts. Tests use a recording sender.
- What gets sent, and to whom, lives in `apps/api/src/clubs/notices.ts`. Everything respects `notification_settings` (a missing row means the defaults) and `club_member.muted`. Reminder timing is `reminderTime()` in `libs/domain/src/reminders.ts`: by default the evening before (19:00 local) for runs starting before 10:00, otherwise two hours before. Someone who RSVPs after their reminder time isn't reminded.
- Run changes notify people who said going or maybe, never whoever made the change: cancelling, moving, and series edits that remove a run (`syncFutureRuns` calls back before deleting, while RSVPs still exist).
- The browser side is `apps/web/public/push-handler.js`, loaded into the Workbox service worker with `importScripts`. iOS only allows Web Push from a Home Screen app, and the Settings page says so.
- Weather (`apps/api/src/clubs/weather.ts`) asks Open-Meteo for each meeting point once (positions rounded to about a kilometre), for runs in the next 14 days, and stores the hour nearest the start on `club_run.weather`.

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
