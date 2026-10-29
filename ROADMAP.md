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

### M2 – Run clubs (in progress)

- ✅ Clubs with owner, organiser and member roles; join by link or code, optional approval
- ✅ Meeting points, repeating runs (RRULE), one-off runs, cancellations
- ✅ RSVP (going / maybe / not going)
- ✅ Café menu, coffee order with a saved "usual" (optionally ordered whenever you say you're going)
- ✅ Order cutoff that locks orders and builds a summary any member can show the cashier on their phone (big text, works offline, keeps the screen on)
- Weather forecast (Open-Meteo), Web Push reminders, cancellations
- ✅ Built as its own module that never reads members' run logs; members choose a sharing level per club (attendance only, summaries, or full)
- Check-ins (manual, or from a run the member shares)
- Fun attendance highlights, never speed rankings: streaks, milestones and the club's combined distance, opt-in per member

### M3 – Sync

- Garmin Connect (unofficial API, behind an adapter): scheduled activity import
- Strava OAuth import
- Integrations settings page and sync log

### M4 – Plans and AI

- Plan builder (goal race, date, current mileage, days available) and training calendar
- Matching planned workouts to completed runs
- Pushing structured workouts to the Garmin calendar; showing Runna workouts read from Garmin
- MCP server at `/mcp` (Streamable HTTP) with personal access tokens

## After v0.1

- Federation: keep your log on your own instance and join clubs hosted elsewhere ([docs/PRIVACY.md](docs/PRIVACY.md), phase 3)
- Optional end-to-end encryption of GPS tracks and original files (phase 4)

- In-app AI coach with your own provider (Anthropic, OpenAI, OpenAI-compatible such as Ollama). Changes are proposed, approved and can be undone.
- Capacitor apps for iOS and Android
- Postgres option, OIDC sign-in
- More providers (Coros, Polar, intervals.icu), webhooks, ICS feed for club runs
