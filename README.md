# node-cms

node-cms is a headless content management system for Node.js. You describe your content in plain JavaScript files, one
per resource, and node-cms gives you three things from them: an admin app where editors write and translate that content,
a REST API that serves it to your sites and apps, and a JavaScript API for your own server code.

It stores everything in JSON files by default, so there is no database to set up; MongoDB and PostgreSQL are there when
you need them. It runs on its own or inside an existing Express app, handles translations, images and files, users and
rights, and can keep several servers in step.

![The admin app: a list of records and the editor](docs/ui/form-light-1280x720.png)

## Try it in five minutes

You need [Node.js](https://nodejs.org/) 22.12 or later and git.

```sh
git clone https://github.com/xiaodoudou/node-cms-private.git node-cms
cd node-cms
npm install
npm run build        # builds the admin app into dist/
node server.js
```

Open <http://localhost:9990/admin> and sign in with **localAdmin** / **localAdmin** when the browser asks. The menu
already holds a catalogue of example resources, one per family of field types (see [`resources/`](resources/README.md)).
Click around: everything you see there is generated from the files in `resources/`.

The first start writes a `cms.json` with the default settings and a `data/` folder with your content. Stop the server
with Ctrl+C.

## Your first resource

Say you want to publish articles, in English and Chinese. Create `resources/articles.js`:

```js
module.exports = {
  displayname: 'Articles',
  group: 'Content',
  locales: ['enUS', 'zhCN'],
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'slug', input: 'transliterate', label: 'Slug', localised: false, unique: true, options: { valueFrom: 'title' } },
    { field: 'body', input: 'wysiwyg', label: 'Body' },
    { field: 'cover', input: 'image', label: 'Cover', localised: false, options: { maxCount: 1 } }
  ]
}
```

Restart `node server.js`. **Articles** now appears in the menu under **Content**, with a tab per language, a rich-text
editor and an image drop zone. Write an article and save it.

The same content is already on the REST API:

```sh
curl -u localAdmin:localAdmin http://localhost:9990/api/articles
```

```json
[{ "title": { "enUS": "Hello", "zhCN": "你好" }, "slug": "hello", "body": { "enUS": "<p>…</p>" },
   "_id": "muosrfetmuosr8shy000gql4", "_createdAt": 1790814577349, "_updatedAt": 1790814577349 }]
```

And you can write to it the same way:

```sh
curl -u localAdmin:localAdmin -X POST http://localhost:9990/api/articles \
  -H 'Content-Type: application/json' \
  -d '{ "title": { "enUS": "Second post" }, "slug": "second-post" }'
```

That's the whole loop: describe a resource, edit it in the admin, read it over the API. The
[getting started guide](docs/GETTING_STARTED.md) takes it further: putting node-cms inside your own Express app, letting
everyone read the articles without a password, relations between resources, and going to production.

## Before you go to production

Two things in this quick start are only fit for your laptop. The `localAdmin` account has a published password (the
server logs an error at every start until you change it), and `cms.json` holds secrets whose default values are published
too. Run with `NODE_ENV=production` and follow [SECURITY.md](SECURITY.md): the hardened profile refuses to start with
those defaults.

## Documentation

[docs/README.md](docs/README.md) is the map of the documentation. The pages you'll want first:

- [Getting started](docs/GETTING_STARTED.md): from the quick start to a real project.
- [Concepts](docs/CONCEPTS.md): resources, fields, locales, attachments, users and groups, in plain words.
- [Field types](docs/FIELDS.md): every input type, with screenshots.
- [Configuration](docs/CONFIG.md) and [API](docs/API.md): the references.

## Contributing, security, license

Setting up a development copy, running the tests and writing commits: [CONTRIBUTING.md](CONTRIBUTING.md). Reporting a
vulnerability: [SECURITY.md](SECURITY.md#reporting-a-vulnerability). Known bugs: [docs/BUGS.md](docs/BUGS.md).

Authors: Edouard Durand, Kong Yim, Louis Wang, Hugo Barbier. Released under the [MIT license](LICENSE).
