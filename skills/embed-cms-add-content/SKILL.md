---
name: embed-cms-add-content
description: Add records and files to an embed-cms site, one or a few at a time, through the REST API or the JavaScript API. Use when the user wants to create an article, page or product, upload an image or attachment, or script record creation. For many records or a first import use embed-cms-load-payload.
---

# Add content

Pick the route by where the code runs.

## Against a running server (REST)

```sh
curl -u localAdmin:localAdmin -X POST localhost:9990/api/articles \
  -H 'Content-Type: application/json' \
  -d '{ "title": { "enUS": "Hello", "zhCN": "你好" }, "slug": "hello", "published": true }'
```

- Localised fields are `{ "enUS": "...", "zhCN": "..." }`. To work in one language, add `?locale=enUS` and send plain values (only localised fields are wrapped).
- Relations hold the target `_id`: look it up first (`GET /api/authors?query=...`).
- Upload a file with one file per request. **The name of the multipart part is the field**:
  ```sh
  curl -u USER:PASS localhost:9990/api/articles/<id>/attachments -F cover=@harbour.jpg
  ```
- The body limit is 100 KB (`security.limits.json`). The port is `9990` for `npx cms`, or whatever your server uses.
- Over REST the server does **not** check `required`, formats or min/max: validate yourself. It does check `unique` (`400 Field 'slug' is duplicated`) and group rights.
- Use a dedicated user in a group with only the rights it needs, not `admins`.
- Users and groups (`_users`, `_groups`) are records too, but their fields are not documented as a schema. To create an account from code, copy `docs/examples/docker/server.js`; otherwise use the admin.

## In the same process (JavaScript API)

```js
const articles = cms.api()('articles')
const post = await articles.create({ title: { enUS: 'Hello' }, slug: 'hello' })
await articles.createAttachment(post._id, { name: 'cover', stream: fs.createReadStream('./harbour.jpg'), fields: { _filename: 'harbour.jpg' } })
```

No rights are checked and `_updatedBy` is not set. For many records wrap the writes in `await articles.bulk(async () => { ... })` (one disk wait at the end).

## Do not

- Do not start a second process on the same `data/` folder while the server runs, whatever the engine. leveldb refuses (`the data folder is in use`); sqlite and jsondown do not refuse, and the two processes overwrite each other's writes. Script against the running server over REST, or stop it first. Check with the process manager (systemd, pm2, Docker) that it is really stopped.
- Do not expect REST to create resources: an unknown name is a 404, the resource must exist in `resources/`.
- Check the result: the answer is the stored record with its `_id`. `GET` it back when in doubt.

For more than a handful of records, or content that should live in git, use `embed-cms-load-payload`.
