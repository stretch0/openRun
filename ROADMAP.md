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

### M2 – Run clubs

- Clubs with owner, organiser and member roles; join by link or code
- Locations, café menu, repeating runs (RRULE) with pace groups
- RSVP (going / maybe / not going), coffee order with a saved "usual"
- Order cutoff that locks orders and builds a summary for the café
- Weather forecast (Open-Meteo), Web Push reminders, cancellations
- Check-ins (manual, or matched to a synced run), attendance streaks and leaderboard

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

- In-app AI coach with your own provider (Anthropic, OpenAI, OpenAI-compatible such as Ollama). Changes are proposed, approved and can be undone.
- Capacitor apps for iOS and Android
- Postgres option, OIDC sign-in
- More providers (Coros, Polar, intervals.icu), webhooks, ICS feed for club runs
