---
name: embed-cms-patch-content
description: Change existing embed-cms records safely, whether one field, one language, a bulk edit across many records, or a migration after a schema change. Use when the user wants to fix, update, rename, publish or unpublish, translate or clean up existing content.
---

# Patch content

## How an update merges

`PUT /api/:resource/:id` and `api.update(id, data)` **merge** the body into the record, so send only what changes.

- Objects merge **deeply**: `{ "title": { "zhCN": "你好" } }` adds Chinese and keeps `enUS`.
- **Arrays are replaced whole** (a `multiselect`, a `paragraph` body, a list of images): send the complete new array.
- Fields you leave out stay. To clear one, send it empty (`""`, `[]`, `null`) explicitly. The key then stays with that value: `$exists: false` does not match it, and an empty `unique` field collides with the next empty one.
- A record whose `_id` carries another node's `mid` (`_local: false`) is read-only here (`403 Can't modify foreign records`). Edit it where it was made.

```sh
curl -u USER:PASS -X PUT 'localhost:9990/api/articles/<id>?locale=zhCN' \
  -H 'Content-Type: application/json' -d '{ "title": "你好" }'
```

## Workflow for anything beyond one record

1. **Back up first** (skill `embed-cms-backup-restore`).
2. **Select**: `GET /api/<res>?query=<urlencoded JSON>&limit=100&page=0`. Pages count from 0 and the `numRecords` header is the total. Operators: `$eq $ne $gt $gte $lt $lte $in $nin $all $size $mod $exists $regex $options $and $or $nor $not $elemMatch`. A localised field is `"title.enUS"`. Use `curl -G --data-urlencode`.
3. **Dry run**: print id, old value and new value for every record before writing anything.
4. **Apply** with small PUTs, page by page. Prefer a script against the running server over REST. Or, with the server stopped, a script that does `const cms = new CMS(); await cms.bootstrap()` and uses `cms.api()`.
5. **Verify**: run the same query again, count, spot-check, load a public page. Pages written through the same process refresh on their own. After a write from another process, call `pages.invalidate('articles')` or wait for `maxAge`.

```js
// server stopped (check with the process manager), bulk fix
const CMS = require('embed-cms')
const cms = new CMS()
await cms.bootstrap()
const api = cms.api()('articles')
await api.bulk(async () => {
  for (const a of await api.list({ published: { $exists: false } })) { // no limit: every record
    await api.update(a._id, { published: false })
  }
})
cms.shutdown('SIGTERM')() // closes the stores, then exits the process (the CMS keeps timers alive, so it would not end by itself)
```

## Tips

- Hooks run on updates. A refusing hook stops the loop at that record and the earlier ones stay written, so make the script safe to run again.
- A unique conflict answers 400: handle it per record.
- For content kept in a file, re-runnable, that leaves unmentioned fields alone: use `embed-cms-load-payload`.
- Attachments: `PUT /api/:res/:id/attachments/:aid` changes metadata (`order`, `cropOptions`), `DELETE .../attachments/:aid` removes one.
- Never bulk-delete without the dry-run list and a fresh backup.
