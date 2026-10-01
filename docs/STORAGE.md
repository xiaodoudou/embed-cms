# Storage engines

Every resource keeps its records in a store, and you choose which kind of store in `cms.json`. There are five. This page
says what each one is good and bad at, shows how they were measured against each other, what each loses when the
process is killed, and how to move a server from one to another. The setting itself, with the `url` of the two database
servers, is in [CONFIG.md](CONFIG.md#storage-engines).

```json
{ "dbEngine": { "type": "sqlite" } }
```

## Which one

| If you... | Use |
|---|---|
| want a normal site with no database server, and the server's memory should not grow with the content | `leveldb` (the default) |
| want the same without a native module, and one file that every SQLite tool can open | `sqlite` |
| are trying node-cms, or want the content as a readable file you can copy, diff and edit | `jsondown` |
| already run MongoDB, or the content is shared with other applications | `mongodb` |
| already run PostgreSQL, or want its backups, replicas and tooling | `postgres` |

If you are not sure, leave `dbEngine` out: new content starts on `leveldb`. `jsondown` is the fastest at reading and
searching, and fine for resources of up to a few tens of thousands of records, but its memory grows with the content.

## The five engines

### `leveldb` (the default)

A LevelDB database per resource, a folder `data/<resource>/json/leveldb/`, through the `classic-level` package.

- **Good:** the smallest on disk (about a third of the others, it compresses). Starts in 0.03 s, memory stays flat. A
  save is answered after it is in the log. The most widely used embedded store of the local three.
- **Bad:** `classic-level` is a native module: it comes with prebuilt files for the usual systems, and the engine refuses to
  start with a clear error when it could not load (set `dbEngine.type` to `sqlite` or `jsondown` then). The slowest of the three at reading single
  records (0.025 ms) and at searches. The folder is not something you open by hand.

### `sqlite`

One SQLite file per resource, `data/<resource>/json/db.sqlite`, in write-ahead-log mode. Records are read from disk (the
operating system caches them), nothing is held in memory.

- **Good:** no server and no new dependency, it is part of Node. Starts instantly. Memory stays flat (about 85 MB at any
  size). A save is answered after it is in the log, so a crash loses nothing that was answered. One file to back up,
  that every SQLite tool can open.
- **Bad:** Node still marks `node:sqlite` as experimental in Node 22, and prints a warning when it is first used. Reads
  are about 10 times slower than from memory (still 0.013 ms), and a search that reads every record takes about 1.6
  times as long as `jsondown`. A save that waits for the disk takes about 1.6 ms.

### `jsondown`

All the records of a resource are held in memory and written to one JSON file, `data/<resource>/json/db.json`, a moment
after a change. The file is written next to its final place and renamed over it, so a crash never leaves a half-written
file.

- **Good:** the fastest at reading and searching, because every record is already in memory. Nothing to install. The
  file is readable text, easy to look at, copy and back up.
- **Bad:** memory grows with the content (about 480 MB for 100,000 records of 1 KB). The whole file is rewritten at
  every save, so a big store takes seconds to flush, and starting the server parses the whole file (0.4 s for 100,000
  records). A save is answered before it reaches the disk, so a crash loses the last moments of work (see
  [what a crash loses](#what-a-crash-loses)).

### `mongodb`

One MongoDB collection per resource, on a server you run. See [CONFIG.md](CONFIG.md#storage-engines) for the `url`.

- **Good:** the content lives in a server of its own: the CMS can restart or crash without touching it, several
  processes can read it, and MongoDB's own backups, replica sets and monitoring apply. Nothing is held in the CMS.
- **Bad:** you run a server. Every read and write is a network round trip (0.2 ms for a read, 0.7 ms for a save), and
  importing is slow because each record is its own write: 100,000 records took 47 seconds, against under one second
  for the local engines. Replication between servers works differently from the three local engines (see
  [REPLICATION.md](REPLICATION.md)).

### `postgres`

One PostgreSQL table per resource, on a server you run.

- **Good:** the same as MongoDB: a server of its own, the PostgreSQL backups, replicas and tools, and the content can be
  queried with SQL by other applications.
- **Bad:** you run a server. The slowest at writing: 2.2 ms for a save and 218 seconds to import 100,000 records, because
  each record is its own write. The data takes the most disk (about 77 MB for the same 55 MB of records).

## Measured

Same data for every engine: 100,000 records of about 1 KB (several fields, two languages, a paragraph of text), written
through the same interface the CMS uses, one process per engine so the memory figures are not mixed. **Lower is better
in every row; the best is in bold.** The local engines ran on Windows 11 (Node 22.19, an NVMe disk); MongoDB 7.0 and
PostgreSQL 16 ran in WSL 2 on the same machine, with the benchmark in WSL too, so they are measured without a real network
(on a network every server figure grows by the round trip). Memory is that of the CMS process: the two servers use
memory of their own on top.

| | `jsondown` | `sqlite` | `leveldb` | `mongodb` | `postgres` |
|---|---|---|---|---|---|
| Starting the server (reopening the store) | 0.42 s | **0.001 s** | 0.03 s | 0.004 s | 0.006 s |
| Memory of the CMS process | 481 MB | **85 MB** | **83 MB** | 118 MB | 104 MB |
| Disk space for the content | 55 MB | 56 MB | **20 MB** | in the server | 77 MB |
| Importing the 100,000 records | **0.57 s** | 0.88 s | 0.73 s | 47 s | 218 s |
| Reading one record | **0.0015 ms** | 0.013 ms | 0.025 ms | 0.21 ms | 0.15 ms |
| Reading all the records (a search) | **0.20 s** | 0.33 s | 0.41 s | 0.76 s | 0.54 s |
| Saving a change (no wait for the disk) | **0.009 ms** | 0.058 ms | 0.035 ms | 0.76 ms | 2.2 ms |
| Saving a change that is on disk when it is answered | not offered | 1.6 ms | 1.6 ms | **0.67 ms** | 2.2 ms |
| Final save when the server stops | 0.28 s | 0.01 s | **0.005 s** | 0 | 0 |

The CMS asks for the "on disk when answered" kind of save for every record it writes. `jsondown` cannot give it: it
answers first and writes the file a moment later, which is why its row says "not offered" and why it loses writes in a
crash.

What the numbers mean in use: an editor saving a record waits well under 3 ms on every engine, so the choice is not about
the speed of a save. It is about memory (`jsondown` grows with the content), start-up (`jsondown` parses its file),
searches over a very large resource (about twice as long on the disk engines, and still a third of a second for 100,000
records), and what is lost if the process dies.

At 10,000 records the differences shrink: `jsondown` uses 120 MB and starts in 0.04 s, `sqlite` and `leveldb` use 66 MB
and start in 0.001 s and 0.05 s. Any engine is fast enough at that size.

Not measured: MongoDB's and PostgreSQL's disk use by the same method as the others (its figure was clearly too small to be right), a real network between the CMS and a database server, many editors at
once, and a power cut.

### Running the benchmark

`test/bench/stores.js` measures the engines through the same interface, outside the CMS:

```sh
npm run bench:stores                                   # jsondown, sqlite, leveldb at 10,000 and 100,000 records
node --expose-gc test/bench/stores.js --sizes 100000 --engines sqlite,leveldb
npm run bench:stores:crash                             # the crash test below
```

For the two servers set `BENCH_MONGODB_URL=host:27017`, `BENCH_POSTGRES_URL=host:5432` (with `POSTGRES_USER` and
`POSTGRES_PASSWORD`) and add them to `--engines`. Run it on an otherwise idle machine and compare runs made on the same one.
It is a separate tool from `test/bench/bench.js`, which measures the whole CMS on the default store.

## What a crash loses

The crash test (`npm run bench:stores:crash`) starts a process that writes records one after another, the way the REST
API does, and prints each record once its write has been answered. The test kills the process without warning at a random
moment, starts the store again, and looks for every record that was answered. A record that was answered and is gone is
lost data. Five to eight kills per engine, 2,000 older records already in the store:

| | Opens again | Older records lost | Answered and lost after the kill |
|---|---|---|---|
| `jsondown` | yes, every time | none | **the last few**: 5 on average, 8 at worst, out of about 85 (the writes of the last tenth of a second or so) |
| `sqlite` | yes, every time | none | **none** |
| `leveldb` | yes, every time | none | **none** |
| `mongodb` | yes, every time | none | **none** (the data is in another process) |
| `postgres` | yes, every time | none | **none** (the data is in another process) |

- **No engine corrupts its data when the process dies**, and none loses a record that was written before. That includes
  `jsondown`: it writes a temporary file and renames it, so the file on disk is always a whole one, the one from the last
  flush.
- **`jsondown` loses the writes made since its last flush**, a fraction of a second of work under normal use. Under a
  continuous flood of writes (a loop writing as fast as it can, about 100,000 records a second) its flush does not get
  a turn and it lost everything written since the start of the burst: that is not how editors work, but a script that
  loads records one by one through the API can do it. Importing (one big batch) does not.
- **A power cut is not the same as a killed process** and was not tested: the operating system can hold written data
  in memory for a while. `sqlite` and `leveldb` are written to sync the log before they answer when the CMS asks for it
  (and it does, for every record it creates or updates), so they are built to survive one; `jsondown` is not.
- MongoDB and PostgreSQL lose nothing when the *CMS* dies. When their own server dies, what is lost depends on how you
  run them, not on node-cms.

## Changing the engine

Changing `dbEngine.type` does not move the content: the new engine starts empty, because it looks in its own file or
folder (`db.json`, `db.sqlite`, `leveldb/`), and the old files are left alone. To change engine and keep the content:

**Updating from a version where `jsondown` was the default.** Nothing to do: a resource that already has a `db.json` and no
`leveldb/` folder keeps using the file when `dbEngine` is not set, and the CMS logs a warning that says how to move it.
Move it when it suits you, with the steps below (`--to leveldb`), or set `"dbEngine": { "type": "jsondown" }` to stay on the
file on purpose.

### Between `jsondown`, `sqlite` and `leveldb`

1. Stop the CMS.
2. Back up the data folder.
3. Copy the content to the new engine:

   ```sh
   npm run migrate-store -- --from jsondown --to sqlite --data ./data
   ```

   Add `--dry-run` first to see what it would copy and write nothing. It goes through every resource, namespaces
   included, and copies the records together with the replication's own bookkeeping, so a server that replicates
   carries on where it stopped. It skips a resource that already has a store of the new engine, so a second run never
   merges into one.
4. Set `"dbEngine": { "type": "sqlite" }` in `cms.json` and start the CMS. Check the content.
5. When you are satisfied, delete the old files (`db.json`) from each `data/<resource>/json/` folder. The tool never
   deletes them.

`leveldb` needs the `classic-level` package: `npm install classic-level` if it did not install with node-cms.

### From or to `mongodb` or `postgres`

There is no direct copy: use one of the ways node-cms already has to move content between two servers.

- Start a second CMS with the new engine, and copy from the first with [import from remote](IMPORT.md#copying-from-another-node-cms-import-from-remote)
  (it copies the records and files of the resources you choose), or with a [sync](SYNC.md).
- Or [replicate](REPLICATION.md) the two servers for a while, and retire the old one.

Whichever way you choose, rehearse it on a copy first, and keep the old data until the new engine has been through a
day of real use.

## Good to know

- Every engine passes the same driver contract suite (CRUD, unique keys, every query operator, paging, import maps,
  attachments, a restart on the same data), see [TESTING.md](TESTING.md#driver-contract-suite). Queries are filtered in
  the CMS with the same code on all of them, so a query gives the same answer whatever the engine.
- The attachments are files in `data/<resource>/blob/` whatever the engine: only the records move.
- An unknown `dbEngine.type` stops the start with an error, so that a typo cannot open an empty store.
- The three local engines share the replication code, so replication works the same on them. The two servers have their
  own, see [REPLICATION.md](REPLICATION.md).
