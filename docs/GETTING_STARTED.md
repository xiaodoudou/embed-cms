# Getting started

The [README](../README.md) runs node-cms from a clone and adds a first resource. This guide picks up from there and builds
a small but real project: node-cms inside your own Express server, a few related resources, public read access for
your site, editors with limited rights, and the steps to production. Each section stands on its own, so skip what you
don't need.

If a word is unfamiliar (resource, locale, paragraph), [CONCEPTS.md](CONCEPTS.md) explains it in a few lines.

## 1. Add node-cms to your project

node-cms is an Express application you mount in yours. In a project folder with a `package.json` (run `npm init -y` if
you don't have one; node-cms needs it):

```sh
npm install git+https://github.com/xiaodoudou/node-cms-private.git express
```

The admin app ships as source code, so build it once after installing, and again after each upgrade of node-cms. The
build looks for your own admin pages in `node-cms/plugins/` at the root of your project; if you have none yet, start from
the empty sample, or the build fails ([BUGS.md](BUGS.md#start-up-and-configuration)):

```sh
mkdir -p node-cms && cp -r node_modules/node-cms/src/.plugins node-cms/plugins   # first time only
cd node_modules/node-cms
npm install --include=dev
npm run build
cd ../..
```

Then a `server.js`:

```js
const express = require('express')
const CMS = require('node-cms')

const cms = new CMS({ mid: 'webnode1' })
const app = express()

app.use(cms.express())                  // /admin, /api and the plugin routes
app.get('/', (req, res) => res.send('My site'))

const server = app.listen(3000, async () => {
  await cms.bootstrap(server)           // opens the stores, creates the default groups and users
  console.log('Admin at http://localhost:3000/admin')
})

process.on('SIGINT', cms.shutdown('SIGINT'))   // closes the stores cleanly
process.on('SIGTERM', cms.shutdown('SIGTERM'))
```

`node server.js` creates `cms.json`, `resources/` and `data/` in the current folder. Pass `bootstrap` the HTTP server, as
above: the admin uses it for live updates over a websocket.

`mid` names this server: it must be **exactly 8 characters** and different on every server that shares content. You
can't change it later without making existing records read-only, so pick it now. All options are in
[CONFIG.md](CONFIG.md).

## 2. The project layout

```
my-site/
├── cms.json              written at the first start, then yours to edit
├── data/                 the content: one folder per resource (keep it out of git, back it up)
├── node-cms/plugins/     your own admin pages (Vue), built into the admin app
├── resources/
│   ├── articles.js       one file per resource; the file name is the resource name
│   ├── authors.js
│   └── paragraphs/
│       └── quote.js      block types for paragraph fields
└── server.js
```

The CMS reads `resources/` at start-up. **Restart after changing a resource file.**

## 3. Describe your content

A resource file exports a declaration. `schema` lists the fields; everything else is presentation:

```js
// resources/authors.js
module.exports = {
  displayname: { enUS: 'Authors', zhCN: '作者' },
  group: 'Content',
  schema: [
    { field: 'name', input: 'string', label: 'Name', required: true, unique: true },
    { field: 'photo', input: 'image', label: 'Photo', options: { maxCount: 1, accept: '.jpg,.png' } },
    { field: 'bio', input: 'text', label: 'Short bio' }
  ]
}
```

```js
// resources/articles.js
module.exports = {
  displayname: 'Articles',
  group: 'Content',
  locales: ['enUS', 'zhCN'],
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'slug', input: 'transliterate', label: 'Slug', localised: false, unique: true, options: { valueFrom: 'title' } },
    { field: 'author', input: 'select', label: 'Author', localised: false, source: 'authors', options: { customLabel: '{{name}}' } },
    { field: 'published', input: 'checkbox', label: 'Published', localised: false },
    { field: 'body', input: 'paragraph', label: 'Body', options: { types: ['quote'] } }
  ]
}
```

A few things are happening here:

- **`locales`** gives every field of `articles` one value per language, with a tab per language in the editor. Fields
  that don't change with the language say `localised: false`.
- **`source: 'authors'`** makes the select offer the records of another resource. It stores the author's `_id`.
- **`unique`** is checked by the server, and it is how imports and syncs recognise a record. Give every resource one.
- **`group`** files the resource under a heading in the admin's menu.

Other resource-level keys you'll meet: `view: 'table'` shows the records as a spreadsheet-like table instead of a list,
and `maxCount: 1` makes a resource a single record (site settings, a home page) with no list at all. The field types and
all their options are in [FIELDS.md](FIELDS.md), and `resources/` in this repository has an example of each.

## 4. Let your site read the content

On a fresh install, reading the API needs a login: the `anonymous` group has no rights. To publish resources to
everyone, list them in `cms.json` and restart:

```json
{ "anonymousRead": ["articles", "authors"] }
```

Your site can now fetch `/api/articles` without credentials. Two habits will save you trouble:

```js
// only published articles, ten per page (pages count from 0); numRecords holds the total
const query = encodeURIComponent(JSON.stringify({ published: true }))
const res = await fetch(`https://cms.example.com/api/articles?query=${query}&limit=10&page=0`)
const total = Number(res.headers.get('numRecords'))
const articles = await res.json()
```

- **Always set `limit`.** Without it you get every record.
- **There is no sort parameter.** Records come in creation order; sort them yourself.

If your site runs in the same process as the CMS, skip HTTP and use the JavaScript API:

```js
const articles = cms.api()('articles')
const latest = await articles.list({ published: true }, { page: 0, limit: 10 })
const bySlug = await articles.find({ slug: 'hello' })   // one record or null
```

The JavaScript API doesn't check rights: it is your server's own access. [API.md](API.md) has every route and method,
attachments and image resizing included.

## 5. Give editors their own accounts

Users and rights are content too, in the **CMS** group of the menu.

1. In **Groups**, create a group `editors`. Tick the resources its members may read, create, update and remove, and
   the ones whose files they may change (`attachments`). Leave out `_users` and `_groups`, or editors can make themselves
   administrators.
2. In **Users**, create an account per person, in that group.
3. Create your own administrator in the `admins` group, sign in with it, and delete `localAdmin`.

The `admins` group gets every right on every resource at each start, so a new resource is never locked away from it.
The built-in pages of the System menu (Syslog, Cms Config) are for the `admins` group only, and each shows up once its
name is in the group's **plugins** list: Syslog is added at every start, Cms Config you add yourself.

## 6. Go to production

Before the first real user, work through the [hardening checklist](../SECURITY.md#hardening-checklist). The short
version:

- run with `NODE_ENV=production`, which selects the `hardened` security profile;
- set `auth.secret` and `session.secret` to long random values, or the server refuses to start;
- make sure no `localAdmin` account is left with its default password;
- behind a reverse proxy, set `trustProxy` and serve the admin over HTTPS;
- back up `data/` (or your database) and `cms.json`.

Outside development, run the CMS under a supervisor (systemd, pm2, Docker) that restarts it: saving the configuration from
the admin exits the process on purpose.

## When something goes wrong

| You see | Why, and what to do |
|---|---|
| `Cannot find module '…/package.json'` at start | node-cms needs a `package.json` in the folder you start it from. Run `npm init -y`. |
| `Machine id should be an 8 digit string` when saving | `mid` isn't 8 characters. Fix it before you have records. |
| A blank admin page, `ENOENT … dist/index.html` in the log | The admin app isn't built. Run the build of step 1. |
| `401` from the API | No credentials, and the `anonymous` group can't read that resource. Use `anonymousRead` or send a login. |
| `200` with `null` for a record | The id doesn't exist. The API doesn't answer `404` yet ([BUGS.md](BUGS.md#rest-api)). |
| A new field doesn't show up | Restart: resource files are read at start-up. |
| `EADDRINUSE` | Another process holds the port. |
| The server refuses to start in production | The secrets are missing, short or still the published defaults. See [SECURITY.md](../SECURITY.md). |
