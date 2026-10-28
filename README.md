# openRun

An open-source, self-hosted running app: log your runs, plan your training, sync with Garmin, connect AI assistants over MCP, and organise your run club (including the coffee order).

One instance serves many people, so a run club can host it for its members. It also works fine for one person. It's inspired by [openGym](https://github.com/DuarteSantos8/openGym).

> **Status: early development.** The foundation is in place: accounts, passkeys, invites, the installable PWA and the Docker image. Run logging, run clubs, Garmin sync and MCP are next. See [ROADMAP.md](ROADMAP.md).

## Features

|                                                                                | Status       |
| ------------------------------------------------------------------------------ | ------------ |
| Accounts with passkeys or password, first user becomes admin, invite-only mode | ✅           |
| Installable PWA (works offline from cache, update prompt)                      | ✅           |
| Single Docker image with SQLite, migrations applied on start                   | ✅           |
| Run log: FIT/GPX import, maps, splits, PBs, shoes, stats                       | Planned (M1) |
| Run clubs: repeating runs, RSVPs, coffee orders, weather, reminders            | Planned (M2) |
| Garmin Connect and Strava sync                                                 | Planned (M3) |
| Training plans, push workouts to Garmin, Runna via Garmin, MCP server          | Planned (M4) |

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

## Development

You need Node 22 or later.

```bash
npm install
npm run dev
```

The API runs on http://localhost:3000 and the PWA on http://localhost:4200, which proxies `/api` to the API. The development database is created at `./data/openrun.db`.

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
