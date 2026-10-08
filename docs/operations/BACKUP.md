← [Documentation](../README.md)

# Backup and restore

Two commands take a copy of a site and put it back: `cms-backup` and `cms-restore`. Each has two modes, and the mode decides what the copy can do.

| | `files` | `api` |
|---|---|---|
| Copies | the data folder and `cms.json` | the records and the files, read over REST, written as a payload (`content.json` and `files/`) |
| The server | stopped | running, and reachable from any machine |
| `_id` of the records | **kept** | **new** after a restore |
| Dates (`_createdAt`, `_updatedAt`), `_createdBy` | kept | new |
| Users, groups and settings | kept | not exported |
| Needs | access to the disk of the server | a user that may read the resources, or a login token |
| Restored with | `cms-restore files` | `cms-restore api`, which is [`cms-load`](CONTENT_LOADER.md) on the payload |

Choose `files` when the site must come back exactly as it was: disaster recovery, a move to another machine, a copy before an upgrade. Choose `api` to take content from a live site you cannot stop or reach by disk, to seed a staging site, or to keep a payload in git. The payload is the format `cms-load` reads, so you can read it, edit it and replay it.

An `_id` is stored by anything outside the CMS: a link, a bookmark, another system's table. After an `api` restore those ids no longer exist. Relations inside the CMS survive, because the payload writes them as `authors://mei-lin` (the unique value of the record) and the loader turns them back into ids.

## `files`

```sh
npx cms-backup files --server-stopped
npx cms-restore files backups/embed-cms-backup-20261008-123609-files --server-stopped
```

Run them in the project folder, with the server stopped. `--server-stopped` is required, because a copy of a store that is being written can be broken, and only LevelDB refuses a second process: SQLite and the JSON file do not.

- The backup is a new folder `backups/embed-cms-backup-<date>-files/` (change the place with `--out`) with `data/`, `cms.json` and `manifest.json`. It holds the secrets of `cms.json`: keep it private and out of git.
- `--config <file>` names the `cms.json` when it is not `./cms.json`. The data folder is the `data` option of that file.
- A restore moves the data folder that is there to `data.replaced-<date>`. It never deletes it. `cms.json` stays the one of the project, unless you add `--with-config`, which also moves the current one aside.
- The files of every storage engine are in `data/`. With MongoDB or PostgreSQL the records are in the database server, so also take a dump with `mongodump` or `pg_dump`: `cms-backup files` copies only the files of the attachments and the configuration.

## `api`

```sh
EMBED_CMS_PASSWORD=... npx cms-backup api --url https://cms.example.com --user reader
npx cms-restore api backups/embed-cms-backup-20261008-123609-api --server-stopped
```

- The user needs the `read` right on the resources to export. Give `--token <token>` (or `EMBED_CMS_TOKEN`) instead of a user when the server uses the JWT login. Pass the password through `EMBED_CMS_PASSWORD`, which keeps it out of the list of processes.
- `--resources articles,authors` exports only those. The default is every resource except the system ones (`_users`, `_groups`, `_settings`).
- The backup folder holds `content.json`, `files/<resource>/<record>/<field>/<file>` and `manifest.json` (the counts, the source address without credentials, and the warnings).
- The resources are written in the order they can be loaded, with the targets of relations first. Dates are written as ISO texts, files as `attachment://` paths, relations as `resource://unique-value`.
- `cms-restore api` starts the CMS of the project and loads the payload, so the server of the project must be stopped. It creates the records that are missing and updates those that match a unique field. It deletes nothing. `--dry-run` checks the payload and says what would change.

What the payload cannot carry, and the command says so in a warning:

- **A resource without a `unique` field.** The loader refuses it, because a second run would make copies. Add a `unique` field to the resource before the restore, or name a field with `cms-load --key`.
- **A relation to a record with no unique value, or to a resource left out of the backup.** The relation is left out of the payload.
- **The files and the relations inside `paragraph` blocks.** The loader does not read files in blocks, and the ids inside blocks are not turned into references.
- **The system resources.** Re-create users and groups in the admin, or restore a `files` backup for them.

## Which one for what

- Every night, on the server: stop it for a minute, `cms-backup files`, start it, copy the folder off the machine. Or snapshot the volume if the platform gives atomic snapshots.
- Without stopping the server: `cms-backup api` from anywhere, plus a [sync](SYNC.md) or a [replication](REPLICATION.md) peer. None of them saves the system resources, so keep a `files` copy for them.
- Before a bulk patch, an engine change or an upgrade: a `files` backup.
- Test a restore on another machine once. A backup nobody restored is a guess.

## Exit codes

`0` done. `2` the command is wrong (a missing mode, a missing `--server-stopped`, an unknown resource). `1` the payload has problems (`cms-restore api` only, the same as `cms-load`). `3` the system failed: a server that cannot be reached or refuses the login, a data folder that is missing or in use.
