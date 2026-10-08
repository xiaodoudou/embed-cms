---
name: embed-cms-load-payload
description: Load content and files into embed-cms from a JSON payload with ContentLoader or the cms-load command. Use for first content of a new site, fixtures, sample data, seeding staging, or a migration the user wants to read in a diff and run repeatedly.
---

# Load a payload (ContentLoader / `cms-load`)

Layout:

```
content/
├─ content.json
└─ files/ (images and attachments)
```

`content.json`: one list of records per resource, **in creation order, relation targets first**.

```json
{
  "authors": [{ "name": "Mei Lin", "slug": "mei-lin", "photo": "attachment://files/mei-lin.jpg" }],
  "articles": [
    {
      "slug": "slow-mornings",
      "title": { "enUS": "Slow mornings" },
      "author": "authors://mei-lin",
      "categories": ["categories://travel"],
      "publishedOn": "2026-10-01",
      "cover": "attachment://files/lisbon.jpg",
      "published": true
    }
  ]
}
```

- Write records as the CMS stores them: localised fields as `{ enUS, zhCN }`, plain values for `localised: false` fields, nested fields as nested objects.
- **Relations** are `resource://<unique value>` (never an `_id`), in single values and lists. The target must be the field's `source`.
- **Files** are `attachment://<path relative to the JSON file>`; the path cannot leave the folder. For a name, order or crop use `{ "uri": "attachment://...", "name": "...", "order": 1, "cropOptions": {...} }`.
- Dates: `"2026-10-01"` or `"2026-10-01T09:30:00Z"`.
- A resource with `maxCount: 1` may be given the record itself instead of a list.
- A record is found by the **first `unique` field** of the resource (override with `--key articles=slug`). A resource with no `unique` field and not `maxCount: 1` is refused, because a second run would make copies: add a `unique` field, or name an existing field with `--key`.- `_users`, `_groups` and `_settings` are not loaded this way. Files inside `paragraph` blocks are not loaded (add them in the admin).

## Run it

Stop the project's server first. One process per data folder: leveldb refuses a second one (exit code 3), but sqlite and jsondown do not, and the two processes overwrite each other's writes. Check with the process manager that the server is really stopped. Then, in the project folder:

```sh
npx cms-load ./content/content.json --dry-run   # validate and report, write nothing
npx cms-load ./content/content.json
```

Options: `--config <cms.json>`, `--key <resource>=<field>` (repeatable), `--loose` (keep fields the resource does not declare), `-q`. Exit codes: `0` done, `1` content problems (nothing written, every problem listed with its place), `2` wrong command, `3` system (data folder in use, unreadable file, a write refused by a hook or a required field).

From code, in a running process: `await new CMS.ContentLoader(cms).load('./content/content.json')` (or pass an object; a file can be `{ buffer, name }`). The report has `created`, `updated`, `unchanged` and `files`.

## Semantics to remember

- It is idempotent. Missing record: created. Same: `unchanged`. Different: updated with the file's fields; **lists are replaced whole**; fields the file does not mention are kept.
- **Records are never deleted.** A file whose MD5 is already attached stays; a file no longer listed in a field you mention is removed.
- All validation happens before the first write. Always run `--dry-run` first and fix every listed problem (typo'd field names are caught in strict mode).
- It writes through `cms.api()`: hooks and unique checks run, rights do not.
- To move content between two CMS servers, do not use this: see `embed-cms-sync-migrate`.
