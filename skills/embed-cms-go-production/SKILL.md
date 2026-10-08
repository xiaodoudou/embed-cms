---
name: embed-cms-go-production
description: Prepare an embed-cms site for production, covering secrets, the first administrator, reverse proxy, anonymous reads, Docker, and upgrading embed-cms. Use when the user wants to deploy, harden, ship, upgrade or review the security of an embed-cms site.
---

# Go to production

The sources are `SECURITY.md` (settings, recommended configuration, checklist) and `docs/examples/docker/README.md`, both at https://github.com/xiaodoudou/embed-cms. Read `SECURITY.md` before you change a setting. Do not invent option names.

## Checklist

1. **Secrets.** Run with `NODE_ENV=production`: the CMS then refuses to start with weak or published-default secrets. Set `auth.secret` and `session.secret` (and `replication.secret` if you replicate) to random values of at least 32 characters. The CMS reads them from `cms.json` or the constructor, not from the environment by itself, so pass them in code: `new CMS({ auth: { secret: process.env.AUTH_SECRET }, session: { secret: process.env.SESSION_SECRET } })`. The alternative is `security.generateSecrets: true`, which keeps generated secrets in `<data>/.secrets.json`. Generate values with `openssl rand -hex 32`, keep them out of git, and do not print them back.
2. **First administrator, before you switch to production.** With `NODE_ENV=production` on a fresh data folder no `localAdmin` exists, so nobody can sign in. Create your administrator first, either in development through the admin, or in code the way `docs/examples/docker/server.js` does (a user in the `admins` group, from `ADMIN_USERNAME` and `ADMIN_PASSWORD`). Then delete `localAdmin` if it exists. Create an `editors` group with only the resources they need and no rights on `_users` or `_groups`.
3. **Public reads.** `anonymousRead` lists only the resources that are public. Loaders filter `published: true`, because PageHelper reads check no rights.
4. **Replication.** It is on by default. A single server sets `disableReplication: true`. A replicated setup needs `replication.secret` and a `direction` on every peer.
5. **Reverse proxy.** Set `trustProxy` to the number of proxies, forward `X-Forwarded-Proto`, serve over HTTPS. If the admin is on another origin than the API, list it in `allowedOrigins`.
6. **Configuration.** Start from the "Recommended production configuration" block of `SECURITY.md` and add only your own options.
7. **Keep the CMS off the public site** when you can (the docs platform example serves the admin on a second port).
8. **Uploads.** Tune `limits.upload`. Never add `text/html` or `image/svg+xml` to `inlineTypes`.
9. **Storage.** Choose the engine on purpose (`docs/operations/STORAGE.md`); the default leveldb is fine. Back up `data/` and `cms.json` and test a restore (`embed-cms-backup-restore`).
10. **Supervisor.** Run under systemd, pm2 or Docker so it restarts. The configuration is read once at start, so a change needs a restart.
11. **CI.** Run `npm audit --omit=dev`.

## Docker

Use `docs/examples/docker` as a base. The image holds no secret; a `.env` on the host has them and a script generates random values. The container runs read-only, as a non-root user, bound to the machine's address. Mount `data/` as a volume.

## Upgrading embed-cms

1. Back up first (`embed-cms-backup-restore`).
2. `npm install embed-cms@latest`, read `CHANGELOG.md`, restart.
3. If the project has admin pages in `embed-cms/plugins/`, rebuild the admin (`cd node_modules/embed-cms && npm install --include=dev && npm run build`).
4. A resource that has a `db.json` and no `leveldb/` folder keeps using the file when `dbEngine` is not set, and the CMS logs how to move it.
5. When nodes replicate `_users`, upgrade every node before using `scrypt` hashes: a node on an older release cannot verify them.

## Verify before saying done

Start with `NODE_ENV=production` and the real configuration, and wait for the "started" log line. Check that it boots, that `GET /api/_users` without credentials answers 401, that a private resource answers 401 and a public one 200, and that signing in with `localAdmin` fails. `GET /admin` answers a redirect, so follow it (`/admin/`) before judging.
