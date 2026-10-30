# openRun

An open-source, self-hosted running app: log your runs, sync from your watch, and organise your run club (including the coffee order).

Your runs are yours: they're private unless you choose to share them, and clubs only ever see what you send them. Run it for yourself, or for friends and family who trust you with their data. It's inspired by [openGym](https://github.com/DuarteSantos8/openGym).

> **Status: early development.** Accounts, the run log, stats, privacy controls, run clubs and watch sync work. Next is the v0.1 release. See [ROADMAP.md](ROADMAP.md).

## Features

|                                                                                | Status       |
| ------------------------------------------------------------------------------ | ------------ |
| Accounts with passkeys or password, first user becomes admin, invite-only mode | ✅           |
| Installable PWA (works offline from cache, update prompt)                      | ✅           |
| Single Docker image with SQLite, migrations applied on start                   | ✅           |
| Run log: FIT/GPX import, maps, splits, PBs, shoes, stats, export               | ✅           |
| Privacy: private by default, sharing settings, privacy zones                   | ✅           |
| Run clubs: repeating runs, RSVPs, coffee orders, weather, reminders            | ✅           |
| Watch sync via intervals.icu (Garmin, Coros, Polar, Suunto, Wahoo)             | ✅           |

## Self-hosting with Docker

```bash
curl -O https://raw.githubusercontent.com/stretch0/openRun/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/stretch0/openRun/main/.env.example
```

Set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `ORIGIN` (the URL people will use) in `.env`, then:

```bash
docker compose up -d
```

Open the URL. The first account you create becomes the admin. Everything is stored in `./data`, so back up that folder.

Passkeys need HTTPS (or `localhost`), so put openRun behind a reverse proxy such as Caddy or Traefik for anything beyond local use. When you do, set `TRUST_PROXY=true`. All settings are listed in [.env.example](.env.example).

### Forgotten passwords

There's no password reset by email, and admins can't reset passwords from inside the app. Whoever runs the server can:

```bash
docker compose exec openrun node reset-password.js someone@example.com
```

It prints a temporary password and signs that person out everywhere. Send it to them privately; they can change it in Settings.

## Your data and privacy

- Runs are visible only to their owner unless they choose to share them.
- Shared runs show the route only if the owner allows it, with their privacy zones cut out.
- Admins manage invites and settings; they can't see other people's runs.
- Whoever runs the server can read what's stored on it, as with any server. Set `INSTANCE_CONTACT` so members know who that is, and only host data for people who trust you.

The full design, including plans for clubs that connect separate instances, is in [docs/PRIVACY.md](docs/PRIVACY.md).

## Development

You need Node 22 or later.

```bash
npm install
npm run dev
```

The API runs on http://localhost:3000 and the PWA on http://localhost:4200, which proxies `/api` to the API. The development database is created at `./data/openrun.db`.

If something else already uses port 3000, pick another for the API; the PWA follows it:

```bash
PORT=3005 npm run dev
```

| Command                                        | What it does                                             |
| ---------------------------------------------- | -------------------------------------------------------- |
| `npm run dev`                                  | API and web app in watch mode                            |
| `npm run lint`                                 | ESLint and type checks                                   |
| `npm test`                                     | Unit tests (Vitest)                                      |
| `npm run e2e`                                  | Playwright tests against the production build            |
| `npm run db:generate -- --name=<description>`  | Generate a migration after changing `libs/db/src/schema` |
| `npx nx affected -t lint typecheck test build` | Only what your change affects                            |

The repo is an [Nx](https://nx.dev) monorepo. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together.

## Licence

[AGPL-3.0-or-later](LICENSE). If you run a modified openRun for other people, you must share your changes.
