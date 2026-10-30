# Security

openRun holds people's runs, GPS routes and intervals.icu access, so security
reports are very welcome.

## Reporting a vulnerability

Please report it privately through GitHub:
[**Report a vulnerability**](https://github.com/stretch0/openRun/security/advisories/new)
(Security → Advisories → Report a vulnerability). Don't open a public issue.

Include what you found, how to reproduce it, and what someone could do with
it. You'll get a reply within a week. Once it's fixed, the advisory is
published with credit to you, unless you'd rather not be named.

## Supported versions

Fixes go into the latest release and `main`. openRun is pre-1.0, so there are
no older release lines to backport to: upgrade to the latest release (see
[Upgrading](README.md#upgrading)).

## Checking a release

Release images and source archives come with signed build provenance:

```bash
gh attestation verify oci://ghcr.io/stretch0/openrun:0.1 -R stretch0/openRun
gh attestation verify openrun-0.1.0.tar.gz -R stretch0/openRun
```

## Running your own server

Whoever runs an openRun server can read what's stored on it. See
[docs/PRIVACY.md](docs/PRIVACY.md) for what's stored and who can see what, and
the README for keeping `.env` and backups safe.
