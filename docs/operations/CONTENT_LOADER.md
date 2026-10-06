← [Documentation](../README.md)

# ContentLoader: content and files from a JSON file

`CMS.ContentLoader` puts content **and files** into the CMS from a description you write as JSON: sample content for a new site, the first version of a project, a fixture for tests, a migration you can read in a diff. Records refer to each other with `authors://mei-lin`, files with `attachment://files/cover.jpg`, and the loader checks everything before it writes anything. It can be run again: it changes only what differs. (It is typed too: see [TYPESCRIPT.md](../reference/TYPESCRIPT.md).)

```
content/
├─ content.json
└─ files/
   ├─ mei-lin.jpg
   └─ lisbon.jpg
```

`content.json`: one list of records for each resource, in the order they are made, the targets of relations first:

```json
{
  "authors": [
    { "name": "Mei Lin", "slug": "mei-lin", "photo": "attachment://files/mei-lin.jpg" }
  ],
  "categories": [
    { "slug": "travel", "name": { "enUS": "Travel", "zhCN": "旅行" } }
  ],
  "articles": [
    {
      "slug": "slow-mornings-in-lisbon",
      "title": { "enUS": "Slow mornings in Lisbon" },
      "author": "authors://mei-lin",
      "categories": ["categories://travel"],
      "publishedOn": "2026-10-01",
      "cover": "attachment://files/lisbon.jpg",
      "published": true
    }
  ]
}
```

From code, with the CMS started:

```js
const CMS = require('embed-cms')

const cms = new CMS()
await cms.bootstrap()

const report = await new CMS.ContentLoader(cms).load('./content/content.json')
// { dryRun: false, created: 3, updated: 0, unchanged: 0, files: { added: 2, removed: 0, unchanged: 0 }, resources: { authors: {…}, … } }
```

From a terminal, in the folder of the project (see [the command](#the-command)):

```sh
cms-load ./content/content.json
```

## The file

- The top level is an object: a key for each **resource**, a list of **records** for its value (a resource that holds one record, `maxCount: 1`, may be given the record itself).
- A record is written the way the CMS stores it: a localised field is an object with a text for each language (`"title": { "enUS": "…", "zhCN": "…" }`), a field that is not localised holds its value, a nested field (`address.city`) is a nested object. A switch is `true` or `false`, a number is a number.
- The **order of the resources is the order they are made in**: put the targets of relations before the records that point to them (authors before articles). A relation to something made later is reported, with the place.
- A field the resource does not declare is reported (`articles[1].titel: articles has no field "titel"`), because it is nearly always a typo. `--loose` (or `strict: false`) keeps it instead.
- The resources of the CMS itself (`_users`, `_groups`, `_settings`) are not loaded this way: use the admin, or `cms.api()`.

## Relations: `resource://key`

A `select` or `multiselect` that points to another resource holds the `_id` of the record, which you cannot know in advance. Write `authors://mei-lin` instead: **the record of `authors` whose unique field is `mei-lin`**. The loader makes the records in order and puts the ids in.

```json
"author": "authors://mei-lin",
"categories": ["categories://travel", "categories://food"]
```

- The resource in the reference must be the one the field points to (`source` of the field): `categories://travel` in the `author` field is an error.
- It works for one record and for a list, for a localised field (a reference for each language), and inside the blocks of a `paragraph` field.
- The target may be in the same file (made earlier) or already in the CMS.
- A text that is not a reference in such a field (`"mei-lin"`, an `_id`) is an error: `a reference to authors is written "authors://<slug>", not "mei-lin"`. The key is taken as it is written after `://`, with no decoding.

### What names a record

A record is found by **the first field of the resource that is `unique`** (the same rule as the [other imports](IMPORT.md)). That is also the `key` in `resource://key`.

- If that field is localised, the key is its value in the **first language** of the resource.
- A resource that holds one record (`maxCount: 1`, the settings of a site) needs no unique field: its only record is the one that is updated.
- A resource with neither cannot be loaded again without making copies, so it is refused: declare a unique field, or name the field in `keys` (`--key articles=slug`).

## Files: `attachment://path`

In a file field (`file`, `image`, `cropimage`, `imagemap`) write `attachment://` and the path of the file, **relative to the folder of the JSON file**:

```json
"cover": "attachment://files/lisbon.jpg",
"gallery": ["attachment://files/lisbon-1.jpg", "attachment://files/lisbon-2.jpg"]
```

The loader adds each file to the record as the admin does, with its name and a type taken from the name. The same file can be used by many records.

- A plain path with no `attachment://` is an error, and so is an `attachment://` text in a field that holds no file: a forgotten prefix or a typo is found, not stored as text.
- **A path cannot leave the folder of the content.** `attachment://../secrets.txt`, an absolute path, and a link that leads outside the folder are refused, so a content file you did not write cannot read other files of your server.
- A file that does not exist, or is a folder, is reported with its place, before anything is written.
- A localised file field takes a file for each language, `"photo": { "enUS": "attachment://files/en.jpg", "zhCN": "attachment://files/zh.jpg" }`; a single file goes to the first language.
- `attachment://` is for the **fields of a record**. Files inside the blocks of a `paragraph` field are not loaded (the loader says so): add them in the admin.

### A file with options

When a file needs a name of its own, a place among the files of the field, a crop or an image map, give an object whose `uri` is the file:

```json
"cover": {
  "uri": "attachment://files/lisbon.jpg",
  "name": "lisbon-harbour.jpg",
  "order": 1,
  "cropOptions": { "aspect": "3:2" }
}
```

| Key | Meaning |
|---|---|
| `uri` | `attachment://<path>`, as above. |
| `name` | The file name to keep (the name of the file by default). The type comes from it. |
| `order` | A number: the place of the file among the files of the field. |
| `cropOptions`, `imageMap` | As in the [REST API](../reference/API.md#attachments). |
| `fields` | More text parts to keep with the file (`_fields`). |
| `contentType` | A type, for a name that says none. |

### Files that are made by code

From code a file can also be a buffer or a stream, with a name, for pictures a script makes:

```js
await new CMS.ContentLoader(cms).load({
  authors: [
    { name: 'Mei Lin', slug: 'mei-lin', photo: { buffer: await makePortrait(), name: 'mei-lin.jpg' } }
  ]
})
```

A buffer is compared like any file. A stream is read once and always added, since its content is not known before it is read. (The CMS looks at the first bytes of a file to know what it is, and can only do it for a file on disk: the loader writes a buffer or a stream to a temporary file for the time of the upload and deletes it.)

## Dates

A `date` or `datetime` field takes a text: `"2026-10-01"` (the start of that day, as the date field of the admin makes it) or `"2026-10-01T09:30:00Z"`. The loader keeps the timestamp the field stores. Something that is not a date is reported.

## Running it again

A load can be run as often as you like. The record is found by its unique field, then:

- **Not there:** it is created.
- **There, and it holds everything the file says:** it is left alone (`unchanged`). The record may hold more than the file mentions, such as a field you did not write: that is not a difference.
- **There, and something differs:** it is updated, with the fields of the file. Fields the file does not mention are kept. A list is replaced as a whole, so a `categories` list of two ids that the file says is one id becomes one id.
- **Files:** for each file field the file mentions, a file whose MD5 is already attached stays (`unchanged`), a new one is added and one the file no longer says is removed. A field with an empty list, `"cover": []`, loses its files. A file field the file does not mention is not touched.
- **Records are never deleted.** A record that is in the CMS and not in the file stays.

## Checked before it is written

The loader reads the whole file and checks it before it makes anything: resources, fields, keys, relations, files and dates. If anything is wrong it **writes nothing** and throws a `ContentError` with every problem, each saying where:

```
The content has 3 problems:
 - articles[0].author: there is no authors with slug "nobody"
 - articles[0].cover: the file files/missing.png does not exist (looked for /project/content/files/missing.png)
 - articles[1].titel: articles has no field "titel" (declared: title, summary, body, slug, cover, author, categories, publishedOn, featured, published)
```

`error.problems` is the list. (The values can still be refused when they are written: a required field that is missing, a value the resource's hooks refuse. That error stops the load at that record, and the ones before it are kept: run it again once fixed.)

## A dry run

`dryRun: true` (`--dry-run`) does everything but write: it checks, then reports what a real load would create, update and attach.

## The options

| Option | Default | Meaning |
|---|---|---|
| `basePath` | the folder of the JSON file; the current folder for an object | What `attachment://` paths are relative to. |
| `dryRun` | `false` | Check and report, write nothing. |
| `keys` | none | `{ articles: 'slug' }`: the field that names a record of a resource when it is not its first unique field. |
| `strict` | `true` | `false` keeps a field the resource does not declare, instead of reporting it. |
| `log` | none | A function told what is done to each record: `articles/lisbon: created, 1 file added`. |

The report: `created`, `updated` and `unchanged` records, `files` (`added`, `removed`, `unchanged`), `dryRun`, and the same counts for each resource in `resources`.

## The command

`cms-load` loads a file into the CMS of the project in the current folder (its `cms.json` and data folder), then stops:

```sh
cms-load ./content/content.json
cms-load ./content/content.json --dry-run
cms-load ./content/content.json --config ./config/cms.json --key articles=slug
```

| Option | What it does |
|---|---|
| `--dry-run` | Check and say what would change; write nothing. |
| `--config <file>` | The `cms.json` of the project (default `./cms.json`). |
| `--key <resource>=<field>` | The `keys` option; it can be repeated. |
| `--loose` | The `strict: false` option. |
| `-q`, `--quiet` | Only the summary, not a line for each record. |

### Exit codes

The exit code says what kind of failure it was, so that a script can react to it. They are laid out like those of [`cms-sync`](SYNC.md) (`0` done, `1` the work itself failed, `2` a wrong command, `3` the system): here `1` is about the content, `2` about the command, `3` about the machine.

| Code | Meaning | For example |
|---|---|---|
| `0` | Done (with `--dry-run`: the check passed). | |
| `1` | **The content has problems.** They are listed, and nothing was written. | An unknown field, a relation to nothing, a file that is missing or outside the folder. |
| `2` | **The command was used wrongly.** The CMS is not started. | No file given, an unknown option, `--key` without `<resource>=<field>`. |
| `3` | **The CMS or the system failed**, not the content. | The data folder is held by the server of the project, the content file cannot be read or is not JSON, a write was refused (a hook, a required field), the CMS could not start. |

```sh
cms-load ./content/content.json
case $? in
  0) echo "loaded" ;;
  1) echo "fix content.json: the problems are listed above" ;;
  2) echo "wrong command: see cms-load --help" ;;
  3) echo "stop the server of the project, or check the project, then run it again" ;;
esac
```

A data folder that the running server holds is the case that is easiest to meet: the command says `the data folder is in use by another process. Is the server of the project running? Stop it first` and exits with `3`. (A write that is refused stops the load at that record and exits with `3` too: the records before it are kept, and the next run, once it is fixed, finds them in place.)

**Stop the server of the project first.** The command starts the CMS itself, and two processes cannot share a data folder: if the server is running, the command says so in one line (`the data folder is in use by another process. Is the server of the project running? Stop it first`) and exits with `3`. To load into a running CMS, call the loader from code, in that process.

## Good to know

- The loader writes through `cms.api()`: the hooks of the resources run and the unique fields are checked, as for any write from code. **No rights are checked**: it is your server writing.
- It is for content you write or generate, not for moving content between two CMS: for that, see [Import and export](IMPORT.md).
- `attachment` is the one word that cannot be the name of a resource you point to in a reference.

The example sites of [`docs/examples`](../examples) are loaded this way: the [magazine](../examples/magazine/README.md) has a `content.json` and a `files` folder next to its resources, and the [blog](../examples/site) a `content.json` of four articles.
