---
name: embed-cms-backup-restore
description: Back up and restore an embed-cms site with cms-backup and cms-restore, either from the data folder (exact copy) or over the REST API of a live site (a payload to replay). Use before any bulk patch, schema change, engine switch or upgrade, for scheduled backups, and when the user wants to copy, clone, restore or replicate the content of a live site.
---

# Back up and restore

The commands `cms-backup` and `cms-restore` come with embed-cms (`npx cms-backup --help`). Full reference: `docs/operations/BACKUP.md` at https://github.com/xiaodoudou/embed-cms.

## Choose the mode first, and tell the user what it means

| | `files` | `api` |
|---|---|---|
| Copies | `data/` and `cms.json` | records and files read over REST, written as `content.json` and `files/` |
| Server | must be stopped | running, can be remote |
| Record `_id` | **kept** | **new** after the restore |
| Users, groups, settings | kept | not exported |
| Restore | `cms-restore files` | `cms-restore api` (that is `cms-load`) |

Say it plainly before you act: a `files` restore brings the site back exactly as it was; an `api` restore creates the records again with **new `_id`**, so anything outside the CMS that stored an `_id` (links, bookmarks, another system) will not find them. Relations inside the CMS survive, because the payload writes them as `resource://unique-value`.

- Disaster recovery, a move, a copy before an upgrade or a bulk patch: `files`.
- A live site you cannot stop or reach by disk, seeding staging, a payload to keep in git or edit: `api`.

## `files`

1. Find out how the site runs (`cms.json`, the process manager) and the storage engine (`dbEngine.type`, default leveldb).
2. **Stop the server** (`systemctl stop`, `pm2 stop`, `docker stop`) and check with the process manager that it is stopped and that no `cms-load` or script is running on `data/`. leveldb refuses a second process, but sqlite and jsondown do not and a copy of a running store can be broken.
3. In the project folder:
   ```sh
   npx cms-backup files --server-stopped            # into ./backups/embed-cms-backup-<date>-files/
   npx cms-backup files --server-stopped --out ../backups --config ./cms.json
   ```
4. Start the server. Check that the backup folder holds `data/`, `cms.json` and `manifest.json`.
5. Restore: stop the server, then
   ```sh
   npx cms-restore files ../backups/embed-cms-backup-<date>-files --server-stopped
   ```
   The data folder that was there is moved to `data.replaced-<date>`, never deleted. `cms.json` stays the project's own unless you add `--with-config`. Start the server and check the resource counts and a few records with their pictures.

With MongoDB or PostgreSQL the records are in the database server: also run `mongodump` or `pg_dump`. `cms-backup files` then covers the attachment files and the configuration. `data/.secrets.json` and `.revoked-tokens.json` are inside `data/` and are copied.

## `api`

```sh
EMBED_CMS_PASSWORD=... npx cms-backup api --url https://cms.example.com --user reader
npx cms-backup api --url https://cms.example.com --token <login token> --resources articles,authors
```

- The user needs the read right on the resources. Put the password in `EMBED_CMS_PASSWORD` (never in the command line or in a file you commit). `--url` defaults to `$EMBED_CMS_URL`, then `http://localhost:9990`.
- The output folder holds `content.json`, `files/` and `manifest.json` with the counts and the **warnings**. Read the warnings and report them to the user:
  - a resource with no `unique` field cannot be restored by `cms-load` (add a unique field first, or restore with `cms-load --key`);
  - a relation to a record with no unique value or to a resource left out of the backup is dropped;
  - the files and relations inside `paragraph` blocks are not carried;
  - `_users`, `_groups` and `_settings` are never exported.
- Restore into a stopped server's project folder (the loader starts the CMS itself): `npx cms-restore api <backup folder> --server-stopped --dry-run`, read the report, then without `--dry-run`. It creates missing records, updates those that match a unique field and deletes nothing.
- The payload is also a normal `cms-load` input: `npx cms-load <folder>/content.json`.

## Habits

- Back up before: bulk patches, `cms-load` into real content, an engine change, an embed-cms upgrade.
- A hot backup of a server you cannot stop: `cms-backup api`, plus a standby kept current with sync (`embed-cms-sync-migrate`). Neither carries the accounts and settings, so keep a `files` copy for those.
- Copy backups off the machine, keep the last several, and test a restore once on another machine.
- Never put backups inside `data/` or in git: they hold users, password hashes and secrets.
- Exit codes: `0` done, `1` payload problems (`cms-restore api`), `2` wrong command, `3` the system failed (server unreachable or login refused, data folder missing or in use).
