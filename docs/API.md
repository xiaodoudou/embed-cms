# API

node-cms gives you two ways to reach your content. Both use the same resources, rights and hooks:

- the **REST API** under `/api`, for websites, apps and scripts that talk HTTP;
- the **JavaScript API**, `cms.api()`, for code that runs in the same process as the CMS: a server that renders pages,
  a migration script, a hook.

The examples use the `articles` resource from the [README](../README.md#your-first-resource). They assume the default
Basic authentication and the `localAdmin` account, on port 9990.

## What a record looks like

A record is the object you saved, with a few fields the CMS adds. Every added field starts with an underscore:

```json
{
  "title": { "enUS": "Hello", "zhCN": "你好" },
  "slug": "hello",
  "_id": "muosrfetwebnode1y000gql4",
  "_createdAt": 1790814577349,
  "_updatedAt": 1790814595146,
  "_publishedAt": null,
  "_updatedBy": "admins~localAdmin",
  "_local": true,
  "cover": [
    {
      "_id": "muossjzlwebnode1y0dlua1m",
      "_contentType": "image/jpeg",
      "_size": 48211,
      "_md5sum": "3bdaf5969285188ac756c339f69f5c79",
      "_fields": { "_filename": "harbour.jpg" },
      "url": "/api/articles/muosrfetwebnode1y000gql4/attachments/muossjzlwebnode1y0dlua1m",
      "_isAttachment": true
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `_id` | 24 characters: a timestamp, the [`mid`](CONFIG.md#core) of the node that created it, and a sequence. Ids of one node sort in creation order. |
| `_createdAt`, `_updatedAt` | Milliseconds since 1970 (UTC). |
| `_publishedAt` | `null` when the record is created. |
| `_updatedBy` | `<group>~<username>` of the last REST write. Writes made through the JavaScript API don't set it. |
| `_local` | `true` when this node created the record. Records replicated from another node are `false`, and can't be changed here. |

A **localised field** holds one value per locale (`"title": { "enUS": "…", "zhCN": "…" }`); a field with
`localised: false` holds the value itself. To query a localised field, name the locale: `"title.enUS"`.

**Attachments** come back grouped under the name of the field they belong to (`cover` above), as an array, with a `url`
to download them. A resize cache and a crop are made on request (see below).

## REST

### Records

| Method and path | What it does |
|---|---|
| `GET /api/:resource` | List records. Accepts `query`, `limit` and `page`. |
| `GET /api/:resource/:id` | One record, or `404` when there is no record with that id. |
| `POST /api/:resource` | Create a record from the JSON body; answers the record. |
| `PUT /api/:resource/:id` | Update: the body is merged into the record, so send only what changes. |
| `DELETE /api/:resource/:id` | Remove the record and its attachments; answers `true`. |
| `GET /resources` | The declarations of every resource (schema, locales and so on). |

```sh
curl -u localAdmin:localAdmin -X POST localhost:9990/api/articles \
  -H 'Content-Type: application/json' \
  -d '{ "title": { "enUS": "Hello", "zhCN": "你好" }, "slug": "hello" }'

curl -u localAdmin:localAdmin -X PUT localhost:9990/api/articles/<id> \
  -H 'Content-Type: application/json' -d '{ "slug": "hello-world" }'
```

A record made by another node of a replicated setup (its id carries that node's `mid`, and it reads `_local: false`) can't
be changed or deleted here: `PUT` and `DELETE` answer `403` with `Can't modify foreign records`, and the record stays.
Edit it on the node that created it. A delete the store fails to carry out answers `500`; it is never reported as done.

A JSON body is limited to 100 KB by default, on every route. The one setting is `security.limits.json` (see
[SECURITY.md](../SECURITY.md#settings)); a larger body answers `413` with a JSON message that names it, for example
`Request body larger than security.limits.json (100kb)`.

### Querying and paging

`query` is a JSON filter in the MongoDB style, evaluated by [sift](https://github.com/crcn/sift.js). `limit` sets the
page size and `page` picks a page, **counting from 0**. When `limit` is present, the `numRecords` response header holds
the number of records that match, so you can draw a pager.

```sh
# the first ten published articles, and how many there are in all
curl -G -u localAdmin:localAdmin localhost:9990/api/articles -D - \
  --data-urlencode 'query={"published": true}' -d limit=10 -d page=0

# English titles that start with "How"
curl -G -u localAdmin:localAdmin localhost:9990/api/articles \
  --data-urlencode 'query={"title.enUS": {"$regex": "^How"}}'
```

Use `-G` with `--data-urlencode`: a raw `{` in a curl URL is read as a glob, and an unencoded query is rejected.

Things to know:

- Allowed operators: `$eq $ne $gt $gte $lt $lte $in $nin $all $size $mod $exists $regex $options $and $or $nor $not
  $elemMatch`. Anything else, `$where` included, is refused, as are queries nested deeper than 10 levels and patterns
  longer than 200 characters. Regular expressions that can backtrack badly are refused too.
- **There is no sort parameter.** Records come back in creation order (by `_id` in the default store, by creation time
  in MongoDB and PostgreSQL). Sort on your side if you need another order.
- **Without `limit` you get every record.** Always page lists that can grow.
- The filter runs in the CMS, over every record of the resource, whatever the storage engine. That is fast for
  thousands of records and slower for hundreds of thousands.
- A refused query answers `400` with the reason as JSON, always; so does a `query` that isn't valid JSON.

### Attachments

Upload a file with a multipart `POST`. **The name of the file part is the field it belongs to**:

```sh
curl -u localAdmin:localAdmin localhost:9990/api/articles/<id>/attachments -F cover=@harbour.jpg
```

The attachment keeps the name of the uploaded file (`harbour.jpg`), and its type is taken from that name. A `_filename`
text part, which the admin sends, overrides it.

Send one file per request: only the first file of a request is kept. Other text parts are stored in `_fields`, except
`order` (a number, for sorting the files of a field) and `cropOptions` (JSON, used by `/cropped` below).

| Method and path | What it does |
|---|---|
| `POST /api/:resource/:id/attachments` | Add an attachment (multipart, see above). |
| `GET /api/:resource/:id/attachments/:aid` | Download it. Images accept `?resize=800x600`, `?resize=800xauto` or `?resize=autox600`, and `&smart=true` with [smart cropping](SMART_CROPPING.md). Resized copies are cached. |
| `GET /api/:resource/:id/attachments/:aid/cropped` | The image cut with its stored `cropOptions` (set in the admin's crop tool). |
| `GET /api/:resource/file/:aid` | Download by attachment id alone. |
| `PUT /api/:resource/:id/attachments/:aid` | Change its metadata (JSON body): `_fields`, `order`, `cropOptions` and the like. |
| `PUT /api/:resource/:id/attachments` | The same for several attachments: a JSON array of objects with an `_id`. |
| `DELETE /api/:resource/:id/attachments/:aid` | Remove it. |
| `DELETE /api/:resource/:id/attachments` | Remove several: a JSON array of `{ "_id": … }`. |

The admin checks `accept`, `limit` and `maxCount` of a file field before it uploads. The REST API only enforces
`maxCount`, on `image` fields. Uploads also get size limits, and HTML, SVG or script files
download instead of opening in the browser (see `strictUploads` and `safeAttachments` in
[SECURITY.md](../SECURITY.md#settings)).

### Localised records over REST

Send localised values field first, the way the admin stores them: `{ "title": { "enUS": "Hello", "zhCN": "你好" } }`.

When a client works in one language at a time, `?locale=` saves it from building that shape: the plain values of the
body are taken as that locale's values.

```sh
# create, with the Chinese values
curl -u localAdmin:localAdmin -X POST 'localhost:9990/api/articles?locale=zhCN' \
  -H 'Content-Type: application/json' -d '{ "title": "你好", "slug": "hello" }'
# stored as { "title": { "zhCN": "你好" }, "slug": "hello" } (slug is not localised)

# later, add the English title without touching the Chinese one
curl -u localAdmin:localAdmin -X PUT 'localhost:9990/api/articles/<id>?locale=enUS' \
  -H 'Content-Type: application/json' -d '{ "title": "Hello" }'
```

Only localised fields are wrapped; other keys are stored as sent. A locale the resource doesn't declare answers `400`.

### Authentication and errors

With the default Basic authentication, send `-u user:password` (an `Authorization: Basic` header). With the JWT login,
see [CONFIG.md](CONFIG.md#authentication). A request without credentials runs as the `anonymous` user, whose group has
no rights on a fresh install, so it gets `401`. To publish a resource to everyone, list it in
[`anonymousRead`](CONFIG.md#features-you-can-switch).

The server checks `unique` fields (`400 Field 'slug' is duplicated`) and the rights of your group. It does **not** check
`required`, formats, `min`/`max` or patterns: the admin does that. A REST client must validate its own input (see
[What is checked where](FIELDS.md#what-is-checked-where)).

## JavaScript

`cms.api()` returns a function. Call it with a resource name to get that resource's API. Every method returns a
promise.

```js
const CMS = require('node-cms')

const cms = new CMS()
await cms.bootstrap()

const articles = cms.api()('articles')

const post = await articles.create({ title: { enUS: 'Hello' }, slug: 'hello' })
await articles.update(post._id, { slug: 'hello-world' })

const one = await articles.find(post._id)               // the record, or null
const bySlug = await articles.find({ slug: 'hello-world' }) // the first match, or null
const page = await articles.list({ 'title.enUS': { $regex: '^Hel' } }, { page: 0, limit: 10 })
const there = await articles.exists(post._id)           // true or false

await articles.remove(post._id)
```

Note the difference between the two lookups: **`find` returns one record (or `null`), `list` returns an array.**

| Method | What it does |
|---|---|
| `list(query?, { page, limit }?)` | Records matching a filter, as an array. |
| `find(idOrQuery)` | One record by id, or the first one matching a filter; `null` when there is none. |
| `exists(idOrQuery)` | `true` or `false`. |
| `create(data)`, `update(id, data)`, `remove(id)` | Write. |
| `createAttachment(id, { name, stream, fields })` | Add a file to a record; `name` is the field. |
| `findAttachment(id, aid, { resize, smart }?)` | An attachment with a readable `stream`. |
| `findFile(aid)` | The stream of an attachment by its id alone. |
| `updateAttachment(id, aid, data)`, `removeAttachment(id, aid)` | Change or remove an attachment. |
| `cleanAttachment()` | Remove files no record points to (only those idle for `attachmentCleanupGrace`). |
| `before(event, fn)`, `after(event, fn)` | Hooks, see below. |
| `options` | The resource declaration. |

The JavaScript API runs with full rights: there is no user and no group check, and `_updatedBy` is not set. Check rights
yourself before you expose it to a request.

```js
const fs = require('fs')

await articles.createAttachment(post._id, {
  name: 'cover',
  stream: fs.createReadStream('./harbour.jpg'),
  fields: { _filename: 'harbour.jpg' }
})
```

### Hooks

A hook runs before or after an operation, for the REST API and the JavaScript API alike. It receives a context and must
call `context.next()` to carry on, or `context.error(...)` to stop:

```js
const articles = cms.api()('articles')

// refuse an article without an English title, whoever sends it
articles.before('create', (context) => {
  const title = context.params.object && context.params.object.title
  if (!title || !title.enUS) {
    return context.error({ code: 400, message: 'An English title is required' })
  }
  return context.next()
})
```

The events are the operations: `create`, `read`, `find`, `list`, `update`, `remove`, `createAttachment`,
`findAttachment`, `updateAttachment` and `removeAttachment`. The built-in `_users` resource uses them to hash passwords
and to keep them out of reads, and the built-in `_settings` resource to validate what the admin saves.

### Using the REST pieces in your own Express app

If you need your own routes on top of the CMS (a public search endpoint, a custom response shape), the middlewares of
the REST API are available as `CMS.RestHelper`. See [REST_HELPER.md](REST_HELPER.md).
