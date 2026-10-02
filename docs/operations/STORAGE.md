← [Documentation](../README.md)

# Storage engines

Where do your records actually live? That's the storage engine, and you pick it with one line in `cms.json`. There are five. This page tells you what each one is like to live with, how fast they really are (measured two ways), what happens to your content when the process is killed, and how to move a site from one to another. The setting itself, and the `url` of the two database servers, is in [CONFIG.md](../reference/CONFIG.md#storage-engines).

```json
{ "dbEngine": { "type": "sqlite" } }
```

## Which one should I use?

Short answer: **leave it alone.** Without `dbEngine` you get `leveldb`, which needs nothing installed and doesn't eat memory as your content grows. Change it when one of these sounds like you:

| If you... | Use |
|---|---|
| just want a normal site, no database server, and memory that stays flat as the content grows | `leveldb` (the default) |
| want that without a native module, and a single file any SQLite tool can open | `sqlite` |
| are trying embed-cms out, or want your content as a readable file you can copy, diff and edit | `jsondown` |
| already run MongoDB, or other applications share the content | `mongodb` |
| already run PostgreSQL, or you love its backups, replicas and tooling | `postgres` |

`jsondown` is the fastest at reading and searching, and perfectly fine up to a few tens of thousands of records. Just know that it keeps everything in memory, so the bigger the content, the bigger the process.

**Files are never in the database.** Whatever the engine, an uploaded image or file is written to the disk, in `data/<resource>/blob/`, and the record only keeps a reference to it (its id, name, type and size). That's true for MongoDB and PostgreSQL too: the server holds the records, and the machine that runs the CMS holds the files, so back up both. (A field set up for Alibaba Cloud OSS keeps its files there instead.) It's also why the upload and download numbers below are the same on every engine.

## The five engines

### `leveldb` (the default)

A LevelDB database per resource, in `data/<resource>/json/leveldb/`, through the `classic-level` package.

- **The good:** the smallest on disk (about a third of the others, it compresses). It starts in 0.03 s and memory stays flat. A save is answered once it's in the log. It's the most widely used embedded store of the local three.
- **The catch:** `classic-level` is a native module. It ships prebuilt files for the usual systems, and if yours can't load it the engine refuses to start with a clear error (set `dbEngine.type` to `sqlite` or `jsondown` then). It's also the slowest of the three at reading single records (0.025 ms, which you will never feel) and at searches, and the folder isn't something you open by hand.

### `sqlite`

One SQLite file per resource, `data/<resource>/json/db.sqlite`, in write-ahead-log mode. Records are read from disk (your operating system caches them) and nothing is held in memory.

- **The good:** no server, no extra dependency, it's part of Node. It starts instantly and memory stays flat (around 85 MB at any size). A save is answered once it's in the log, so a crash loses nothing that was answered. One file to back up, and every SQLite tool can open it.
- **The catch:** Node still calls `node:sqlite` experimental in Node 22 and prints a warning the first time it's used. Reads are about 10 times slower than from memory (still 0.013 ms), and a search that reads every record takes about 1.6 times as long as `jsondown`. A save that waits for the disk takes about 1.6 ms.

### `jsondown`

Every record of a resource sits in memory, and gets written to one JSON file, `data/<resource>/json/db.json`, a moment after a change. The file is written next to its final place and renamed over it, so a crash never leaves you with half a file.

- **The good:** the fastest at reading and searching, because everything is already in memory. Nothing to install. The file is plain text: easy to look at, copy and back up.
- **The catch:** memory grows with the content (about 480 MB for 100,000 records of 1 KB). The whole file is rewritten on every save, so a big store takes seconds to flush, and starting the server means parsing all of it (0.4 s for 100,000 records). A save is answered *before* it reaches the disk, so a crash loses the last moments of work (see [what happens if the process is killed](#what-happens-if-the-process-is-killed)).

### `mongodb`

One MongoDB collection per resource, on a server you run. The `url` is in [CONFIG.md](../reference/CONFIG.md#storage-engines).

- **The good:** your content lives in a server of its own. The CMS can restart or crash without touching it, several processes can read it, and MongoDB's backups, replica sets and monitoring all apply. Nothing is held in the CMS.
- **The catch:** you run a server. Every read and write is a network round trip (0.4 ms for a read, 1 ms for a save on the same machine), and importing is slow because each record is its own write: 100,000 records take 75 seconds, against under one second for the local engines. Replication between servers works differently from the local three (see [REPLICATION.md](REPLICATION.md)).

### `postgres`

One PostgreSQL table per resource, on a server you run.

- **The good:** the same story as MongoDB: a server of its own, PostgreSQL's backups, replicas and tools, and other applications can query your content with plain SQL.
- **The catch:** you run a server. It's the slowest at writing: 2 ms for a save, and 205 seconds to import 100,000 records, because each one is its own write. It takes more disk than the local engines (69 MB for the same 56 MB of records).

## How fast are they, really?

Two measurements: the stores on their own, then the whole CMS with real HTTP requests on top. Both are reproducible: the commands are at the end of this section.

### The stores on their own

Same data for every engine: 100,000 records of about 1 KB each (several fields, two languages, a paragraph of text), written through the same interface the CMS uses, one process per engine so the memory figures don't get mixed. **Lower is better in every row, and the best is in bold. Every value has its unit.** Measured on Windows 11 (Node 22.19, an NVMe disk, 32 cores); MongoDB 7.0 and PostgreSQL 16 run in WSL 2 on the same machine and are reached through its virtual network, so every server figure carries a round trip of a fraction of a millisecond, as it would on a fast LAN (on a slower network it grows by that round trip). Memory is that of the CMS process: the two servers use memory of their own on top.

| 100,000 records | `jsondown` | `sqlite` | `leveldb` | `mongodb` | `postgres` |
|---|---|---|---|---|---|
| Starting the server (reopening the store) | 0.37 s | **0.001 s** | 0.03 s | 0.007 s | 0.007 s |
| Memory of the CMS process | 484 MB | 87 MB | **86 MB** | 132 MB | 95 MB |
| Disk space for the content | 56 MB | 56 MB | **20 MB** | 70 MB | 69 MB |
| Importing the 100,000 records | **0.51 s** | 0.79 s | 0.71 s | 75 s | 205 s |
| Reading one record | **0.001 ms** | 0.011 ms | 0.025 ms | 0.39 ms | 0.25 ms |
| Reading all the records (a search) | **0.16 s** | 0.34 s | 0.35 s | 1.47 s | 1.14 s |
| Saving a change, answered right away | **0.0065 ms** | 0.063 ms | 0.029 ms | 0.96 ms | 2.1 ms |
| Saving a change, answered once it is safe on disk | N/A (see below) | 1.5 ms | 1.4 ms | **0.95 ms** | 2.0 ms |
| Final save when the server stops | 0.25 s | 0.014 s | **0.003 s** | 0 s (nothing to save) | 0 s (nothing to save) |

Those two save rows are easy to mix up, so here they are in plain words. There are two ways to save a record:

1. **Answer right away.** The store takes the change into memory, says "done", and writes it to the disk a moment later. Very fast, but if the process dies in that moment, the change is gone.
2. **Answer once it's safe.** The store says "done" only after the change has really been written to the disk. Slower (about 1.5 ms), but a crash can't take it back.

The CMS uses the second way for every record it creates or updates. `sqlite`, `leveldb`, `mongodb` and `postgres` can do it. `jsondown` can't: it only knows the first way, because it keeps everything in memory and rewrites its file afterwards. That's why its slow-save cell says N/A, and why it can lose the last moments of work in a crash (see [what happens if the process is killed](#what-happens-if-the-process-is-killed)).

**So what?** An editor saving a record waits well under 3 ms on every engine, so the choice has nothing to do with the speed of a save. It's about memory (`jsondown` grows with the content), start-up (`jsondown` parses its file), searches over a very large resource (about twice as long on the disk engines, and still a third of a second for 100,000 records; seven to nine times as long on the two servers, which hand the records over the network), and what you lose if the process dies.

At 10,000 records the differences mostly vanish: `jsondown` uses 120 MB and starts in 0.04 s, while `sqlite` and `leveldb` use 66 MB and start in 0.001 s and 0.05 s. Any engine is fast enough at that size.

About the disk row: for the local engines it is the size of the store's folder. The two servers keep their data in their own place, so the row takes what the server reports for the database of the run, measured so that it is the same thing as a folder size: for MongoDB, `storageSize + indexSize` of `dbStats` after an `fsync` command (a checkpoint: WiredTiger writes its files at checkpoints, and before one the figure is the size of the files before the last writes reached them), which is the size of the collection and index files on disk, byte for byte; for PostgreSQL, the sum of `pg_total_relation_size` over the tables of the database (the rows, their TOAST and their indexes), where `pg_database_size` would add the 7 MB of catalogs every database carries. MongoDB's 70 MB is for the most part the index it keeps on every field (`$**`), which is larger than the compressed records themselves; PostgreSQL stores the records as JSONB rows, which take about a quarter more room than the JSON text.

The measurements use a database server on the same machine (a virtual network between it and the CMS, no slower one), one editor at a time or a few clients at once, and no power cut.

### Through the whole CMS

The table above times the stores alone. This one times the real thing: each engine is started *inside* the CMS and driven through its REST API, so every figure includes authentication, rights, hooks, the unique-key check, the store and the answer. The data is 10,000 records of a Products resource (a unique `sku`, two languages, a paragraph of text). Requests come from one client at a time (the latency of one operation), or from several at once where the row says so. Measured on Windows 11, Node 22.19, an NVMe disk, 32 cores, one process per engine; MongoDB 7.0 and PostgreSQL 16 run in WSL 2 on the same machine and are reached through its virtual network, so their figures carry a round trip of a fraction of a millisecond, as they would on a fast LAN. **In every row the best is in bold: lower is better, except for the rows counted in operations per second (ops/s), where higher is better.**

| 10,000 records | `jsondown` | `sqlite` | `leveldb` | `mongodb` | `postgres` |
|---|---|---|---|---|---|
| Starting the server (reopening the store) | 170 ms | 168 ms | 187 ms | 167 ms | **166 ms** |
| Memory after loading the records | 42 MB | 37 MB | 40.4 MB | 47.7 MB | **17.5 MB** |
| Memory after the operations | **81.4 MB** | 157.9 MB | 164.9 MB | 281.2 MB | 418.3 MB |
| Disk space | 53.3 MB | 53.9 MB | **52.4 MB** | 55 MB | 54.2 MB |
| Create a record (POST) | **6.12 ms** | 79.287 ms | 60.746 ms | 194.202 ms | 154.539 ms |
| Update a record (PUT) | **1.375 ms** | 21.408 ms | 4.379 ms | 5.482 ms | 7.105 ms |
| Delete a record (DELETE) | **1.127 ms** | 6.227 ms | 2.21 ms | 5.035 ms | 5.82 ms |
| Create, 8 clients at once (higher is better) | **126 ops/s** | 18 ops/s | 15 ops/s | 5 ops/s | 7 ops/s |
| Read one record by id | **1.504 ms** | 1.664 ms | 2.303 ms | 7.239 ms | 3.45 ms |
| Read one record, 8 clients at once (higher is better) | **764 ops/s** | 635 ops/s | 699 ops/s | 321 ops/s | 492 ops/s |
| List a page of 50 | **9.018 ms** | 31.286 ms | 51.502 ms | 300.068 ms | 189.239 ms |
| List 1000 records | **15.994 ms** | 31.458 ms | 54.784 ms | 223.513 ms | 185.216 ms |
| List a page of 50, 8 clients at once (higher is better) | **267 ops/s** | 69 ops/s | 34 ops/s | 5 ops/s | 7 ops/s |
| Find a record by its unique key | **8.251 ms** | 54.917 ms | 57.612 ms | 195.444 ms | 151.565 ms |
| Filter, one field equals a value | **10.808 ms** | 61.65 ms | 61.075 ms | 193.861 ms | 150.085 ms |
| Filter, text starts with | **33.387 ms** | 90.573 ms | 108.643 ms | 198.966 ms | 153.283 ms |
| Filter, number in a range | **33.88 ms** | 95.996 ms | 98.199 ms | 196.388 ms | 151.028 ms |
| Upload a 100 KB file | **11.088 ms** | 14.729 ms | 13.003 ms | 14.842 ms | 15.894 ms |
| Upload a 5 MB file | 57.227 ms | 52.702 ms | **44.741 ms** | 52.782 ms | 53.993 ms |
| Upload a 100 KB file, 4 clients at once (higher is better) | **154 ops/s** | 142 ops/s | 154 ops/s | 115 ops/s | 112 ops/s |
| Upload an image | 33.779 ms | **29.629 ms** | 33.076 ms | 33.073 ms | 34.395 ms |
| Download a 100 KB file | 3.156 ms | **2.955 ms** | 3.154 ms | 6.633 ms | 5.134 ms |
| Download a 5 MB file | 27.059 ms | 24.298 ms | 24.562 ms | 26.087 ms | **22.866 ms** |
| Remove a file | **3.373 ms** | 7.007 ms | 5.479 ms | 10.116 ms | 8.698 ms |

What to take from it:

- **Reading one record is quick everywhere.** By id it takes 1.5 to 2.3 ms on the local engines and 3.5 to 7 ms on the two servers: the request itself costs more than the store, and a server adds a round trip. With eight clients reading at once, the local engines answer 635 to 764 requests a second, PostgreSQL 492 and MongoDB 321.
- **Creating a record is where every engine but `jsondown` pays, and it is the unique key.** A resource with a `unique` field checks the key on every create and update with a search (`find`) through its records. `jsondown` does that in memory in 6 ms; `sqlite` and `leveldb` read their records from disk and take 60 to 80 ms; MongoDB and PostgreSQL run the search on the server and take 150 to 195 ms, the same time as their "find a record by its unique key" row. The cost grows with the size of the resource, so a very large resource with a unique key is quickest on `jsondown`, or split into smaller resources. A resource with no `unique` field never pays it, and the update and delete rows show what a plain write costs: 1 to 7 ms on every engine, 21 ms for the update on `sqlite`.
- **Searches and filters over many records are where the engines differ most.** A filter over 10,000 records takes 11 to 34 ms on `jsondown`, 60 to 110 ms on `sqlite` and `leveldb`, and 150 to 200 ms on the two servers. The CMS filters the records itself, with the same code on every engine, so a server first hands over the whole resource: the cost of a search on MongoDB or PostgreSQL is the cost of reading 10,000 records over the network, and it is the same for a page of 50 as for 1,000 records.
- **Files don't care about the engine.** They're stored as plain files next to the store, whatever the engine. An upload of 100 KB takes 11 to 16 ms, of 5 MB 45 to 57 ms, a download of 5 MB 23 to 27 ms, everywhere; the differences in those rows are noise. Removing a file also updates the record, which is why the servers take a few milliseconds more.
- **Memory after the operations** is the biggest number of the run, because it includes the buffers of the 5 MB uploads and downloads, which Node holds on to for a while, and the connection pools of the two servers. Compare it between engines only roughly.
- **Disk space** is the data folder of the CMS, which includes the uploaded files (about 40 MB) for every engine. For MongoDB and PostgreSQL it adds what the server holds for the database (how that is measured is under [the stores on their own](#the-stores-on-their-own)). At 10,000 records the five engines are within 3 MB of each other.

### Run it yourself

`test/bench/stores.js` measures the engines on their own, outside the CMS:

```sh
npm run bench:stores                                   # jsondown, sqlite, leveldb at 10,000 and 100,000 records
node --expose-gc test/bench/stores.js --sizes 100000 --engines sqlite,leveldb
npm run bench:stores:crash                             # the crash test below
```

For the two servers set `BENCH_MONGODB_URL=host:27017` and `BENCH_POSTGRES_URL=host:5432` (with `POSTGRES_USER` and `POSTGRES_PASSWORD`), and add them to `--engines`; a server in WSL 2 is reached from Windows through the address of the WSL network interface (`hostname -I` inside WSL), see [TESTING.md](../contributing/TESTING.md#or-run-the-tests-in-wsl). Both benchmarks give each server a database of their own and drop it at the end. Run them on an otherwise idle machine, and compare runs made on the same one.

```sh
BENCH_MONGODB_URL=<wsl-ip>:27017 BENCH_POSTGRES_URL=<wsl-ip>:5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres \
  node --expose-gc test/bench/engines.js --size 10000 --engines jsondown,sqlite,leveldb,mongodb,postgres --json out.json --markdown out.md
```

A machine that drops a connection to a freshly opened local port now and then (see [TESTING.md](../contributing/TESTING.md#random-etimedout-failures-on-one-machine)) does not spoil a run: `engines.js` opens its connections once and keeps them, tries a dropped connection again, keeps the time it lost out of the figures and says so (`connectionRetries` and `retryMs` in the JSON), and starts an engine again when its process could not reach its own server at all.

`test/bench/engines.js` measures the whole CMS on each engine through its REST API: create, read, update, delete, list, find, filter, and file upload and download, with one client and with several:

```sh
npm run bench:engines                                  # jsondown, sqlite, leveldb (and the servers when their url is set), 10,000 records
node --expose-gc test/bench/engines.js --size 100000 --engines sqlite,leveldb
node --expose-gc test/bench/engines.js --scale 0.2     # a quick look: every operation repeated a fifth as often
node --expose-gc test/bench/engines.js --json out.json --markdown out.md
```

It prints a markdown table (the best of each row in bold) and can write the raw numbers as JSON: the mean, the median (`p50`) and the 95th percentile of every operation. There is a third tool, `test/bench/bench.js`: the CMS on the default store, with a profile of the backend (reads, filters, writes, the import map, the export, the REST layer) at 10,000 and 100,000 records.

## What happens if the process is killed?

The crash test (`npm run bench:stores:crash`) starts a process that writes records one after another, the way the REST API does, and prints each record once its write has been answered. Then it kills the process without warning at a random moment, opens the store again, and looks for every record that was answered. A record that was answered and is now gone is lost data. Five to eight kills per engine, with 2,000 older records already in the store:

| | Opens again | Older records lost | Answered and lost after the kill |
|---|---|---|---|
| `jsondown` | yes, every time | none | **the last few**: 5 on average, 8 at worst, out of about 85 (the writes of the last tenth of a second or so) |
| `sqlite` | yes, every time | none | **none** |
| `leveldb` | yes, every time | none | **none** |
| `mongodb` | yes, every time | none | **none** (the data is in another process) |
| `postgres` | yes, every time | none | **none** (the data is in another process) |

- **No engine corrupts its data when the process dies**, and none loses a record that was written before. That includes `jsondown`: it writes a temporary file and renames it, so the file on disk is always a whole one, the one from the last flush.
- **`jsondown` loses the writes made since its last flush.** Under normal use that's a fraction of a second of work. Under a continuous flood of writes (a loop writing as fast as it can, about 100,000 records a second) its flush never gets a turn, and it lost everything written since the burst began. That's not how editors work, but a script that loads records one by one through the API can do it. Importing (one big batch) doesn't.
- **A power cut is not the same as a killed process**, and we didn't test it: the operating system can hold written data in memory for a while. `sqlite` and `leveldb` sync their log before they answer when the CMS asks for it (and it does, for every record it creates or updates), so they're built to survive one. `jsondown` isn't.
- MongoDB and PostgreSQL lose nothing when the *CMS* dies. When their own server dies, what you lose depends on how you run them, not on embed-cms.

## Changing the engine

Changing `dbEngine.type` does **not** move your content. The new engine starts empty, because it looks in its own file or folder (`db.json`, `db.sqlite`, `leveldb/`) and leaves the old files alone. To switch and keep your content:

**Updating from a version where `jsondown` was the default?** Nothing to do. A resource that already has a `db.json` and no `leveldb/` folder keeps using the file when `dbEngine` isn't set, and the CMS logs a warning that says how to move it. Move it when it suits you, with the steps below (`--to leveldb`), or set `"dbEngine": { "type": "jsondown" }` to stay on the file on purpose.

### Between `jsondown`, `sqlite` and `leveldb`

1. Stop the CMS.
2. Back up the data folder. Really.
3. Copy the content to the new engine:

   ```sh
   npm run migrate-store -- --from jsondown --to sqlite --data ./data
   ```

   Add `--dry-run` first to see what it would copy, writing nothing. It goes through every resource, namespaces included, and copies the records together with the replication's own bookkeeping, so a server that replicates carries on where it stopped. It skips a resource that already has a store of the new engine, so a second run never merges into one.
4. Set `"dbEngine": { "type": "sqlite" }` in `cms.json` and start the CMS. Look through your content.
5. When you're happy, delete the old files (`db.json`) from each `data/<resource>/json/` folder. The tool never deletes them for you.

`leveldb` needs the `classic-level` package: run `npm install classic-level` if it didn't come with embed-cms.

### From or to `mongodb` or `postgres`

There's no direct copy. Use one of the ways embed-cms already has to move content between two servers:

- Start a second CMS with the new engine, and copy from the first with [import from remote](IMPORT.md#copying-from-another-embed-cms-import-from-remote) (it copies the records and files of the resources you choose), or with a [sync](SYNC.md).
- Or [replicate](REPLICATION.md) the two servers for a while, then retire the old one.

Whichever way you go, rehearse it on a copy first, and keep the old data until the new engine has been through a day of real use.

## How the code is organised

For anyone who wants to read or extend the storage. It all lives in `lib/db/`:

| Path | What it is |
|---|---|
| `jsonStore.js` | The store of one resource, as the rest of the CMS sees it (`JsonStore`): `read`, `find`, `count`, `create`, `update`, `remove`, `sync` and `close`. It picks the engine from `dbEngine.type`, and it's the only file that knows all five. |
| `FileStore.js` | The attachments of one resource: plain files in `<data>/<resource>/blob/`, whatever the engine. |
| `ForeignRecordError.js` | The error for a record whose id carries another machine id (`mid`): it can be read, not changed. |
| `local/` | The three engines that need no server, and what they share. `localEngines.js` lists them and builds one (`createLocalEngine`, `LOCAL_ENGINES`); `JsonDown.js`, `SqliteDown.js` and `leveldbDown.js` are the engines; `Sync.js` is the replication code they share; `records.js` helps them read and write records. |
| `mongo/` | The MongoDB engine (`MongoDown.js`) and its replication (`SyncMongoDb.js`). |
| `postgres/` | The PostgreSQL engine (`PgDown.js`) and its replication (`SyncPostgres.js`). |

Every engine is an [abstract-level](https://github.com/Level/abstract-level) database: it takes and gives `utf8` keys and values, whatever it uses inside (a `Map` and a file, SQLite rows, LevelDB, a Mongo collection, a PostgreSQL table). That one interface is why the benchmarks (`test/bench/stores.js`) and the driver contract suite (`test/unit/drivers.contract.test.js`, see [TESTING.md](../contributing/TESTING.md#driver-contract-suite)) can run the same checks on all five.

To add an engine: write a class that extends `AbstractLevel` (`local/SqliteDown.js` is the smallest one), register it in `local/localEngines.js` if it needs no server (or add a branch in `jsonStore.js` if it does), and add it to `test/helpers/engines.js` so the contract suite and the benchmarks pick it up.

## Good to know

- Every engine passes the same driver contract suite (CRUD, unique keys, every query operator, paging, import maps, attachments, a restart on the same data), see [TESTING.md](../contributing/TESTING.md#driver-contract-suite). Queries are filtered in the CMS with the same code on all of them, so a query gives the same answer whatever the engine.
- Attachments are files in `data/<resource>/blob/` whatever the engine, and the record only references them: only the records move when you change engine.
- An unknown `dbEngine.type` stops the start with an error, so a typo can't quietly open an empty store.
- The three local engines share the replication code, so replication works the same on them. The two servers have their own, see [REPLICATION.md](REPLICATION.md).
