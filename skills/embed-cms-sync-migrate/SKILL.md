---
name: embed-cms-sync-migrate
description: Move content between embed-cms servers or storage engines, covering staging to production sync with cms-sync, import from a Google Sheet or Excel file, copying from another embed-cms, and switching storage engine with migrate-store. Use when the user talks about syncing servers, importing a spreadsheet, exporting to Excel, cloning a site or changing database. A JSON file you write yourself belongs to embed-cms-load-payload.
---

# Sync, import and migrate

Pick by situation.

| Need | Tool |
|---|---|
| Staging to production, deliberate copies of chosen resources | **sync** (`cms-sync`) |
| A JSON file you write or generate, with files | skill `embed-cms-load-payload` |
| Google Sheet or Excel file into the CMS | **import** (`cms-import`) |
| Edit a resource in Excel and bring it back | **xlsx** plugin |
| One-off seed of a new server from an old one | `cms-import-remote` |
| leveldb, sqlite or jsondown to another of these | `migrate-store` |
| To or from MongoDB or PostgreSQL | import from remote, sync, or replication |
| Several servers kept in step all the time | replication (`docs/operations/REPLICATION.md`) |

All of them match records by **`unique` fields**, since the `_id` differs between servers. A resource without one cannot be synced or imported reliably, so add one to the resources you plan to move. The system resources (`_users`, `_groups`, `_settings`) are not synced or imported this way.

## Sync (staging to production)

1. Put `"sync": {}` in `cms.json` on both servers (add `"resources": ["articles","authors"]` to list what may be synced). Restart.
2. In the admin, **Sync settings** on both: staging allows `read`, production allows `write`. Each side has its own **Token** (long, random) and **Address**, and the other side's token. The tokens are crossed.
3. **Set "The other CMS > Address" only on the server you start the runs from.** If staging knows production's address, every edit on staging asks production to pull it 5 seconds later, and the deliberate push becomes automatic.
4. Every synced resource, and every resource a synced `select` points to, needs a `unique` field.
5. Run it. Pass the token of the server you ask through the environment so it stays out of the process list:
   ```sh
   EMBED_CMS_SYNC_TOKEN=... npx cms-sync push --url https://staging.example.com
   EMBED_CMS_SYNC_TOKEN=... npx cms-sync pull articles authors --url https://staging.example.com
   ```
   Exit codes: `0` done, `1` a resource failed, `2` wrong command, `3` server unreachable or run refused. The Sync page of the admin does the same and previews the changes first.
6. A schedule: `"sync": { "schedule": { "push": "0 3 * * *" } }`.

**A sync makes the target look like the source: records only on the target are deleted.** Back up the target first (`embed-cms-backup-restore`) and preview on the Sync page. A body larger than the target's `security.limits.json` (100 KB by default) answers 413: raise it on the target. `401 token is not match` means the tokens are not crossed correctly.

## Spreadsheets

- One sheet per resource, named after it. Row 1 holds field names (`title.enUS`, dotted names for nested fields). A relation holds the unique value of the target. Use the `import` block (Google service account) or upload an `.xlsx` on the **Cms Import** page.
- Command line: `npx cms-import ./import.json USER:PASS` (`-y` skips the question, `-o` only creates).
- Excel round trip: `"xlsx": true`, then `GET /xlsx/<resource>?token=...` and `POST /xlsx/<resource>/import?token=...`. Records are created and updated, never deleted. A token in a URL leaks into logs, so use a long one.

## Copy from another embed-cms

`npx cms-import-remote ./import-remote.json`, with `local`, `remote` (protocol, host, prefix, username, password) and `resources`. It asks you to confirm. Files are only fetched from the remote's own host (`restrictRemoteUrls`, on by default), plus the `allowedHosts` of that remote.

## Change the storage engine

Between leveldb, sqlite and jsondown:

```sh
# stop the CMS and back up data/ first
node node_modules/embed-cms/scripts/migrateStore.js --from jsondown --to sqlite --data ./data --dry-run
node node_modules/embed-cms/scripts/migrateStore.js --from jsondown --to sqlite --data ./data
# then set "dbEngine": { "type": "sqlite" } in cms.json and start
```

(Inside a clone of the embed-cms repository the same tool is `npm run migrate-store -- ...`.)

Changing `dbEngine.type` alone does **not** move content: the new engine starts empty. The tool never deletes the old files. Remove them yourself after a day of real use. To or from MongoDB or PostgreSQL there is no direct copy: start a second CMS on the new engine and use import from remote or a sync.

The details are in `docs/operations/SYNC.md`, `IMPORT.md` and `STORAGE.md` at https://github.com/xiaodoudou/embed-cms.
