# The public demo

`DEMO_MODE=true` turns an instance into a public demo. On every start, and every night at 04:00 UTC, it:

1. Empties the database and the `files/` and `clubs/` folders under `DATA_DIR`.
2. Seeds sample data through the API (`apps/api/src/demo/seed.ts`): Sam, a runner with 26 weeks of runs around Regent's Park, two pairs of shoes and a privacy zone, plus a run club with six other members, weekly runs, RSVPs and coffee orders. The dates follow the day it runs, so the demo always looks current. Seeding takes about 15 seconds (longer on a small machine); the server answers once it's done.

Visitors sign in as Sam with **Try the demo** on the sign-in page. Everyone shares that login, so demo mode turns off anything that would change the login, let a visitor keep a foothold, or host their files:

- Making accounts, and every account change through Better Auth (password, email, passkeys, deleting the account).
- Importing files and uploading club logos.
- Connecting intervals.icu, notifications and admin changes.

Everything else works and is undone by the next reset.

**Everything in the database is replaced.** Never set `DEMO_MODE` on an instance with real data.

## Running it on Fly.io

[`deploy/demo/fly.toml`](../deploy/demo/fly.toml) runs the published image with demo mode on. The demo needs no volume: the machine's disk is thrown away on every restart or deploy, which is a reset anyway.

```bash
fly apps create openrun-demo
fly secrets set -a openrun-demo BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
fly deploy -c deploy/demo/fly.toml --ha=false
```

Change `app` and `ORIGIN` in the file if you use another app name or your own domain.

After that, the Docker image workflow deploys each new image from `main` to the demo, which also resets it. It needs a deploy token for the app in the repository's `FLY_API_TOKEN` secret:

```bash
fly tokens create deploy -a openrun-demo | gh secret set FLY_API_TOKEN -R stretch0/openRun
```

Keep it to **one machine, always on**:

- Each machine has its own database, so two machines would show visitors different demos and lose their sign-in as requests move between them.
- A stopped machine would seed again when it wakes, which takes about 15 seconds and resets the demo in the middle of someone's visit.

## README screenshots

`scripts/screenshots.mjs` signs in to a running demo and saves light and dark screenshots to `docs/images/`:

```bash
docker build -t openrun .
docker run --rm -p 3000:3000 -e DEMO_MODE=true -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" openrun
node scripts/screenshots.mjs http://localhost:3000
```

It needs Playwright's Chromium (`npx playwright install chromium`), or set `CHROMIUM_PATH`.
