# Architecture

## Overview

openRun ships as **one Docker image**. A Node API built with [Hono](https://hono.dev) serves both `/api` and the built PWA, so passkeys and cookies work on a single origin. Data lives in **SQLite** at `/data/openrun.db`, next to uploaded files.

```
browser / installed PWA ──► api (Hono, Node 22) ──► SQLite (/data)
                              ├─ /api/auth/*   Better Auth (password, passkeys)
                              ├─ /api/*        app routes
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

Planned libs: `ui`. Sync lives in `apps/api/src/integrations` (see Integrations below).

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
- **Logos** (`apps/api/src/clubs/logo.ts`): organisers upload a PNG, JPEG or WebP (checked from its bytes, up to 2 MB). The browser shows it first (`LogoPicker`, using `react-easy-crop`, loaded only then): **Fill the square** sends the chosen area as fractions of the upright image, **Fit whole image** asks for the whole image with transparent padding (`logoPlacementSchema`). sharp turns it upright, cuts it as asked (the middle square if nothing is sent) and saves a 256 px square WebP at `DATA_DIR/clubs/<club id>/logo.webp`. `club.logo_version` is the upload time and goes in the URL, so the image can be cached forever. Members (pending ones too) fetch it by club id, people with an invite link by join code. Without one, `ClubLogo` shows the initials on a colour picked from the club id (`libs/domain/src/club-logo.ts`), never the brand teal.
- Each club has exactly one owner. The owner can hand the club to any active member (`POST /api/clubs/:id/transfer`), staying on as an organiser; that is the only way an owner can leave short of deleting the club.
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

## Notifications and the scheduler

- `apps/api/src/scheduler.ts` runs jobs inside the server with `croner`: reminders and coffee nudges every minute, weather every 30 minutes (a run's forecast refreshes when it's over 3 hours old), intervals.icu sync at :10 and :40, and runs created eight weeks ahead nightly. Each job catches its own errors. It starts in `main.ts`, not `createApp`, so tests drive the job functions directly with a fixed `now`.
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

## Integrations

Runs come from watches through **intervals.icu**, which is an official partner of Garmin, Coros, Polar, Suunto and Wahoo and has an open API whose terms allow storing, sharing and AI use. Decided in October 2026, after ruling out:

- **Garmin directly:** no public API for individuals. The unofficial sign-in sits behind Cloudflare bot checks and changed in March 2026 (garth, the library most tools used, was deprecated). Too fragile to build on.
- **Strava:** its API Policy (June 2026) allows caching data for 7 days at most, bans storing anything derived from it, bans any AI use, bans apps that compete with Strava and needs a paid subscription. Importing into a run log breaks all of that.
- **Apple Health / Health Connect:** need a native app (after v0.1). Garmin doesn't write GPS routes there reliably, so it would mainly suit Apple Watch and Android watches.

How it works (`apps/api/src/integrations`):

- A member connects in one of two ways; `integration.auth_method` says which:
  - **OAuth** (`oauth`), when the server has an intervals.icu OAuth app (`INTERVALS_CLIENT_ID` and `INTERVALS_CLIENT_SECRET`). Settings is a plain GET form to `/api/integrations/intervals/oauth/start`, which keeps the state, PKCE verifier, member and start date in a signed, HttpOnly cookie for 10 minutes and redirects to intervals.icu asking for `ACTIVITY:READ`. intervals.icu sends the member back to `/oauth/callback`, which checks the state and member, swaps the code for an access token (`/api/oauth/token`, within 2 minutes), saves the connection, starts the first sync in the background and redirects to `/settings?intervals=<result>`. Tokens don't expire and there's no refresh token. Disconnecting revokes the token (`DELETE /api/v1/disconnect-app`). Each self-hosted server registers its own app, because intervals.icu ties an app to its redirect URIs.
  - **API key** (`api_key`), always available. The member pastes their key; it's checked against `/api/v1/athlete/0`.
  - Either way the key or token is stored in `integration.credentials`, encrypted with AES-256-GCM under a key derived from `BETTER_AUTH_SECRET` (`apps/api/src/secrets.ts`). Changing that secret means everyone connects again (`status = needs_key`). One intervals.icu account can be connected to one member.
- `syncIntegration()` lists every activity since `sync_from` (only the fields it reads, so a year is tens of kilobytes) and downloads up to 25 new runs per sync, oldest first. It asks for the original file when it's FIT or GPX and for intervals.icu's FIT otherwise (TCX). Files go through the same import as uploads (`insertParsedActivity`) with `source = 'intervals'` and the intervals.icu id as `external_id`; a run that's already there (`findSameRun`) is marked a duplicate. The whole range is listed every time because runs reach intervals.icu late: a watch that syncs days later, or Garmin sending months of history in chunks over several hours after connecting. The list can't be filtered by when an activity arrived.
- `integration_item` remembers every activity looked at, including runs the member later deleted, so nothing is fetched twice and deleted runs stay deleted. Activities that reached intervals.icu from Strava come back as stubs and are recorded as `unavailable`.
- A refused key or token stops scheduled syncs until the member connects again; other errors are logged and retried next time. Two syncs of one connection never overlap. The last 20 syncs are kept for the sync log.
- **Garmin attribution:** intervals.icu's API terms require crediting Garmin on data from Garmin devices. `activity.device` holds e.g. "Garmin Forerunner 265" (built from `device_name`, prefixed with "Garmin" for `GARMIN_CONNECT` activities) and is shown on the feed, the run page and club shares (copied into `club_share.device`).
- `INTERVALS_URL` points at intervals.icu; empty turns sync off. Tests stub `fetch`; e2e runs `apps/web-e2e/fake-intervals.mjs`, which also approves OAuth sign-ins straight away.
- The PWA's offline cache skips navigations under `/api`, so the sign-in redirects always reach the server.

Later: pushing planned workouts to the intervals.icu calendar, which sends them on to Garmin; webhooks instead of polling, for servers with an OAuth app (webhooks are set up per app).

- **Weather:** Open-Meteo. **Maps:** MapLibre with OSM tiles. Neither needs an API key.
