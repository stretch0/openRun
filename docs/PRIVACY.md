# Privacy and data ownership

**Status:** accepted, October 2026. Supersedes the M0 assumption that "one instance serves many users, for example a club hosts it".

## Why this matters

Running data is personal. A GPS track shows where someone lives, when they usually leave the house and the routes they repeat. Heart rate is health data. A club member who signs up to RSVP and order a coffee should not have to hand all of that to whoever runs the club's server.

## Principles

1. **Private by default.** A run is visible only to its owner until they choose otherwise.
2. **The owner decides what is shared, with whom and in how much detail.** Sharing is an explicit act, and sharing a summary never shares the GPS track by accident.
3. **Clubs receive the least data they need.** RSVPs, coffee orders and attendance don't need anyone's running log.
4. **Whoever stores your data is someone you chose.** The design should let runners keep their log on their own instance, or one they trust, and still take part in clubs hosted elsewhere.
5. **No hidden powers.** Anything an admin can do to a user's account is visible to that user.
6. **You can leave.** Export works today, and import into another instance should too.

## Threat model

| Who                                     | What they could see today                                  | What protects against it                                                                     | Phase |
| --------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| Other members of the same instance      | Nothing (activities are already private to their owner)    | Keep private by default; explicit sharing scopes                                             | 1     |
| The public internet                     | Nothing                                                    | Per-run visibility, privacy zones on anything shared                                         | 1     |
| A leaked database, disk or backup       | Everything                                                 | Encryption at rest; fewer instances holding other people's data                              | 1–3   |
| An instance admin without server access | Could take over accounts if we added admin password resets | No admin reset or impersonation in the app; resets only via a server command                 | 1     |
| **The person running the server**       | Everything                                                 | Only keep data on servers the user chose (phase 3); optional end-to-end encryption (phase 4) | 3–4   |

Two honest limits:

- **Nothing stops a server operator reading data they hold in readable form.** The real fix is not sending data to servers you don't trust, which is what federation (phase 3) is for.
- **End-to-end encryption in a web app only partly helps.** The server delivers the JavaScript that does the encrypting, so a malicious operator could ship code that captures keys. It still protects against leaked databases and backups. Signed native apps would close the gap.

## Options considered

### A. One shared instance with strong privacy controls

Everyone in a club uses the club's instance, as today, with private-by-default runs, sharing scopes and privacy zones.

- ✅ Simplest; no new infrastructure.
- ❌ Members must trust the operator with everything. This is the problem we're solving.

### B. Personal instances, with clubs that connect them (federation)

Each runner's log lives on an instance they choose: their own, a friend's, or a hosted one. A club lives on one instance and other instances join it, sending only what each member chooses.

- ✅ The club's server never receives what members don't send.
- ✅ Garmin sync and the MCP server keep working, because they run on the runner's own instance.
- ✅ Fits a self-hosted project: the runner who self-hosts gets the most control.
- ❌ Needs a small server-to-server protocol, identity across instances and handling for instances being offline.
- ❌ Not everyone will run their own instance, so a "trusted host" will still hold some people's data.

### C. End-to-end encrypted, local-first

Data is encrypted in the browser and the server only stores ciphertext.

- ✅ The server can't read stored data.
- ❌ Server-side Garmin sync and MCP don't work. Garmin's unofficial API can't be called from a browser, so sync would need an agent on the user's device.
- ❌ A forgotten password means lost data unless the user keeps a recovery key.
- ❌ Sharing with groups needs key management per club.
- ❌ Partial protection only in a web app (see above).

## Decision

**B, built in phases, with C kept as an option for GPS tracks later.** Phase 1 helps even before federation exists, and phase 2 keeps the code shaped so phase 3 needs no rewrite.

### Phase 1: privacy controls (before M2)

- **Visibility for each run:** `private` (the default) or `clubs` (shared with clubs the user picks). `public` waits until after v0.1.
- **Privacy zones:** circles around places such as home or work, 500 m by default (200 m to 1 km). Each zone's edge is randomised once when it's created: the centre is shifted and the radius grown by a random amount, always still covering the whole circle the user drew, so overlaying shared tracks doesn't reveal the centre. Anything shared beyond the owner has the track inside a zone trimmed, and the start and end are hidden. The owner always sees the full track.
- **Default sharing settings:** the visibility a newly imported run gets, and whether sharing includes the map or just the numbers.
- **Account recovery without admin power:** passwords are reset only with a server command (`reset-password <email>`), run by whoever operates the instance. There's no admin reset or "sign in as" in the app. A banner encourages adding a passkey.
- **Admin role trimmed:** admins manage invites and instance settings. They don't see other users' runs, stats or shoes, and the docs say so.
- **Docs:** a short "who can see what" page in the app and in the README. The sign-up page says which instance stores your data and how to contact its admin, before anything is uploaded.

### Phase 2: M2 run clubs, built as a separate module

The club module never queries `activity`, `activity_stream` or `personal_best`. It only knows:

- **Members** by identity: user id and display name, and later `user@instance`.
- **Club records:** clubs, locations, run series, runs, RSVPs, menu and coffee orders, from the draft model in `HANDOVER.md`.
- **Shares:** a `club_share` row is a **snapshot** a member chose to send to a club. It holds the date, distance, time, pace and optionally a privacy-zoned, downsampled track. It is copied, not joined, so changing or deleting the original run doesn't silently change what the club sees, and the member can withdraw a share.
- **Check-ins:** a check-in is either manual or points to a `club_share`.
- **Highlights, not rankings:** clubs celebrate turning up, never speed. Attendance streaks, milestones ("10th Saturday run", "ran in the rain") and the club's combined distance. There are no pace or distance rankings between members, and a member appears in highlights only if they opt in.

Each club member has a **sharing level**:

| Level                     | What the club gets                                     |
| ------------------------- | ------------------------------------------------------ |
| Attendance only (default) | RSVPs, coffee orders, check-ins                        |
| Summaries                 | Plus distance, time and pace of runs the member shares |
| Full                      | Plus privacy-zoned maps of runs the member shares      |

**Weather and notifications.** Forecasts are fetched by the server for each meeting point, so Open-Meteo (or whatever `WEATHER_URL` points at) sees the meeting point's position and nothing about who's going. Notifications use Web Push: the server encrypts each message for the member's device and hands it to that browser's push service (Google, Apple or Mozilla), which can see when a message is sent but not what it says. Members choose what they're told about, can mute any club, and nothing is sent to a device they haven't turned notifications on for.

**Finding meeting points.** Organisers can search for a place by name. The search goes from the server to a geocoder (OpenStreetMap's Nominatim by default, set with `PLACE_SEARCH_URL`), so the geocoder sees the search text and the server's address but nothing about the member. Operators can point it at their own Nominatim or turn it off; tapping the map and "Use where I'm standing" never leave the device.

Inside one instance, the personal module "sends" a share by calling the club module's API. Phase 3 replaces that call with a message to another instance.

### Phase 3: federation

- **Identity:** `name@instance.example`. Every instance publishes a small document with its public key.
- **Messages:** each is signed (HTTP Message Signatures) and posted to the club's inbox:
  - `join` and `leave`
  - `rsvp`
  - `coffee-order`
  - `check-in`
  - `share` and `unshare`
  - from the club to members: `run-scheduled`, `run-changed` and `order-summary`
- **Offline instances:** messages are queued and retried, and the club keeps its own copy of what it was sent.
- **Joining:** a member on another instance joins with the club's link or code, and their instance makes the join request.
- **Open question:** ActivityPub compatibility, so clubs could show up in Mastodon and similar, against a smaller custom protocol. Decide when phase 3 starts.

### Phase 4 (optional): end-to-end encryption for tracks

If people still want protection from their own host, encrypt `activity_stream` and original files in the browser with a key derived from a passkey (WebAuthn PRF) or a recovery phrase. Summary numbers stay readable so stats and sync keep working.

## What changes in the roadmap

- **New milestone before M2:** "Privacy controls" (phase 1). It replaces the planned in-app password reset.
- **M2 (run clubs):** built as described in phase 2. The data model above replaces the draft in `HANDOVER.md` where they differ, mainly shares and sharing levels.
- **M3 (sync) and M4 (plans and MCP):** unchanged. They run on the runner's own instance, which is the point.
- **After v0.1:** federation (phase 3), then optional end-to-end encryption (phase 4).

## Decisions on the open questions

1. **Public runs:** not in v0.1. Runs are private or shared with clubs.
2. **Privacy zones:** 500 m by default, adjustable from 200 m to 1 km, with a randomised edge.
3. **Leaderboards:** there are none in the competitive sense. Clubs show attendance highlights that members opt into, and nothing ranks people by speed or distance.
4. **Telling members who holds their data:** on the sign-up page and in "who can see what", naming the instance and how to contact its admin.
