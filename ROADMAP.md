# Roadmap

## v0.1

### M0 – Foundation ✅

- Nx monorepo: `api` (Hono), `web` (React PWA), `web-e2e` (Playwright), and shared libs
- SQLite + Drizzle schema, with migrations in their own Nx project (`db-migrations`)
- Better Auth: email + password, passkeys, first user becomes admin, invite-only mode, admin invite management
- Installable PWA: manifest, service worker, offline cache for API reads, update prompt
- A single Docker image (API serves the PWA), docker-compose, GitHub Actions CI and image publishing

### M1 – Run log ✅

- ✅ FIT and GPX import (several files at once, gzipped too), manual entry, original files kept
- ✅ Activity page: map (MapLibre + OSM), splits, laps, pace, heart rate and elevation charts
- ✅ Best efforts and PBs (1k, mile, 5k, 10k, half, marathon)
- ✅ Stats: this week/month/year, weekly and monthly distance, year heatmap, race predictions (VDOT), shoe mileage
- ✅ Export as JSON or CSV (original files per run)

### Privacy controls ✅

See [docs/PRIVACY.md](docs/PRIVACY.md), phase 1.

- Visibility for each run: private (default) or shared with chosen clubs
- Privacy zones (500 m by default, randomised edge) that trim shared tracks near home or work
- Default sharing settings for new runs
- Password reset by server command only; no admin reset or impersonation in the app
- A "who can see what" page, and the sign-up page names who stores your data

### M2 – Run clubs ✅

- ✅ Clubs with owner, organiser and member roles; join by link or code, optional approval
- ✅ Meeting points, repeating runs (RRULE), one-off runs, cancellations
- ✅ RSVP (going / maybe / not going)
- ✅ Café menu, coffee order with a saved "usual" (optionally ordered whenever you say you're going)
- ✅ Order cutoff that locks orders and builds a summary any member can show the cashier on their phone (big text, works offline, keeps the screen on)
- ✅ Weather forecast (Open-Meteo), Web Push reminders (evening before a morning run, otherwise 2 hours before), coffee nudges, cancellation and schedule-change notices, per-club mute
- ✅ Built as its own module that never reads members' run logs; members choose a sharing level per club (attendance only, summaries, or full)
- ✅ Sharing a run with a club as a copy (numbers, or a privacy-zoned route), withdrawable; making a run private takes it back
- ✅ Fun attendance highlights, never speed rankings: weekly streaks, milestones, "ran in the rain", and the club's turnout and shared distance; named only if a member opts in. Saying you're going counts as turning up, so there are no check-ins

### M3 – Sync ✅

Through intervals.icu; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Integrations for why not Garmin or Strava directly.

- ✅ Connect intervals.icu with a personal API key (checked, stored encrypted); runs from Garmin, Coros, Polar, Suunto and Wahoo arrive as their original files every 30 minutes
- ✅ Backfill from a chosen date, a little at a time; duplicates and deleted runs are skipped
- ✅ Sync now, sync log, clear messages when the key stops working or a run came via Strava
- ✅ Garmin attribution on runs recorded with Garmin devices

### Release v0.1

- Handing over a club to another member
- Push notifications checked on real phones
- Clean install from the Docker image, upgrades from older databases, a backup and restore guide
- Tag v0.1.0

## After v0.1

- Federation: keep your log on your own instance and join clubs hosted elsewhere ([docs/PRIVACY.md](docs/PRIVACY.md), phase 3)
- Optional end-to-end encryption of GPS tracks and original files (phase 4)

- Training plans and an MCP server, only in a form the existing Garmin MCP servers don't cover (they already build plans, put workouts on the watch and read runs). For example a club training block everyone follows, or showing the plan an MCP puts on the intervals.icu calendar next to your runs
- In-app AI coach with your own provider (Anthropic, OpenAI, OpenAI-compatible such as Ollama). Changes are proposed, approved and can be undone.
- Capacitor apps for iOS and Android
- Postgres option, OIDC sign-in
- Phone app reading Apple Health and Health Connect (the best route for Apple Watch and Android watches)
- intervals.icu OAuth and webhooks instead of API keys and polling; ICS feed for club runs
