← [Documentation](../README.md)

# Types and editor support

embed-cms ships its own type definitions, so your editor can complete and check what you write: the options of `new CMS(...)`, the `cms` object, the API of a resource, hooks, plugins, resource declarations and the globals of the admin. There's nothing to install except `@types/node`, which most projects have. It works in TypeScript projects, and in plain JavaScript ones through the editor (VS Code, WebStorm) or `// @ts-check`.

The types live in two files, which `package.json` points to (`"types": "index.d.ts"`):

| File | What's in it |
|---|---|
| `index.d.ts` | The server side: `CMS` and `CMS.Options`, `cms.api()` and the resource API, hooks, plugins, `CMS.RestHelper`. |
| `types/global.d.ts` | The `EmbedCMS` namespace: the shape of a resource declaration and of each field, records and attachments, and what the admin puts on `window`. `index.d.ts` pulls it in. |

## Starting the CMS from your own project

```ts
import express = require('express')
import CMS = require('embed-cms')

const options: CMS.Options = {
  resources: './resources',
  data: './data',
  mid: 'webnode1',                       // exactly 8 characters
  mode: 'strict',
  dbEngine: { type: 'sqlite' },          // 'leveldb' | 'sqlite' | 'jsondown' | 'mongodb' | 'postgres'
  auth: { secret: process.env.CMS_AUTH_SECRET! },
  session: { secret: process.env.CMS_SESSION_SECRET! },
  anonymousRead: ['articles'],
  security: { csrf: 'origin', limits: { json: '100kb' } }
}

const cms = new CMS(options)
const app = express()
app.use(cms.express())
const server = app.listen(3000, () => cms.bootstrap(server))
```

A typo in an option name is not caught (`CMS.Options` accepts unknown keys, because plugins read their own), but a wrong value is: `dbEngine: { type: 'mysql' }` doesn't compile. The options are described in [CONFIG.md](CONFIG.md) and [SECURITY.md](../../SECURITY.md), and every one has a comment in `index.d.ts`.

If your project uses `esModuleInterop`, `import CMS from 'embed-cms'` works too.

## Reading and writing records

`cms.api()` gives the API of a resource. It runs with every right (no user, no group check):

```ts
const articles = cms.api()('articles')

const published = await articles.list({ published: true }, { limit: 20, page: 0 })
const one = await articles.find('record-id')            // CMSRecord | null
await articles.create({ title: { enUS: 'Hello' } })
await articles.update(one!._id, { title: { enUS: 'Hello again' } })
```

Records are typed as `CMS.CMSRecord`: the fields the CMS adds (`_id`, `_createdAt`, `_updatedAt`, `_updatedBy`, `_attachments`...) and an open index for the fields of your schema. If you want your own type, intersect it: `type Article = CMS.CMSRecord & { title: { enUS: string } }`.

## Hooks

```ts
articles.before('create', (context) => {
  const title = context.params.object?.title
  if (!title?.enUS) {
    return context.error({ code: 400, message: 'An English title is required' })
  }
  return context.next()
})
```

`HookEvent` lists the events (`create`, `read`, `find`, `list`, `update`, `remove` and the four attachment ones). The documented parts of `context.params` (`object`, `id`, `query`, `options`) are typed; the others are open, because they depend on the operation.

## Describing a resource

A resource file exports a `ResourceDefinition`. In TypeScript, or in JavaScript with a JSDoc comment, the editor completes the keys and checks the `input` of every field:

```js
/** @type {EmbedCMS.ResourceDefinition} */
module.exports = {
  displayname: { enUS: 'Articles', zhCN: '文章' },
  group: 'Content',
  locales: ['enUS', 'zhCN'],
  schema: [
    { field: 'title', input: 'string', required: true, options: { hint: 'Shown in the list' } },
    { field: 'status', input: 'select', source: ['draft', 'published'], localised: false },
    { field: 'cover', input: 'image', options: { maxCount: 1, accept: '.jpg,.png' } }
  ]
}
```

The `EmbedCMS` namespace is available as soon as embed-cms is imported somewhere in the project. In a project that only has resource files, add `node_modules/embed-cms/types/global.d.ts` to `include` in your `tsconfig.json` or `jsconfig.json`.

The same shapes are used in code: `cms.resource('articles', definition)` takes a `ResourceDefinition`.

## Plugins and your own routes

A plugin is a class: `new Plugin(cms, options, configPath)`. It can push work to `cms.bootstrapFunctions`, which runs once the CMS starts:

```ts
class AuditPlugin {
  static pluginName = 'audit'
  constructor (cms: CMS, options?: { resource?: string }) {
    cms.bootstrapFunctions.push(async (done) => {
      cms.api()(options?.resource ?? 'articles').after('update', (context) => context.next())
      done()
    })
  }
}
cms.use(AuditPlugin, { resource: 'articles' })
```

For routes of your own that need the CMS's rights check, `CMS.RestHelper` is typed too: `find_resource`, `authorize` and `parse_query`, in that order (see [REST_HELPER.md](REST_HELPER.md)).

## Plugins of the admin

An admin plugin runs in the browser, inside the admin app. `types/global.d.ts` declares what it can use on `window`:

```ts
window.plugins = [
  { title: 'MyPage', displayname: 'MyPage', component: MyPage, group: 'Tools' }   // a page in the admin menu
]

window.DialogService?.ask({ title: 'Delete?', message: 'This cannot be undone.' }).then((confirmed) => { /* ... */ })
const label = window.TranslateService?.get('TL_SAVE')
```

The host object is `window.embedCms.host`, typed as `EmbedCMS.Host` (its members are listed in [PLUGINS.md](../extending/PLUGINS.md#the-host-object)):

```ts
const host = window.embedCms!.host
const response = await host.fetch('../dashboard/summary')
if (host.can('update', 'articles')) host.navigate({ resource: 'articles' })
const stop = host.on('record:saved', ({ resource, record, created }) => { /* ... */ })
```

`window.embedCms` (the Vue application, with `host` on it), `window.Vue`, `window.disableJwtLogin` and `window.noLogin` are declared as well.

## What isn't typed

- Express objects are `any`, so embed-cms doesn't force `@types/express` on you.
- Many option blocks accept extra keys (`security`, `replication`, `syslog`, `sync`, `import`), because they grow with the plugins. The documented keys are typed.
- The parameters of a hook beyond `object`, `id`, `query` and `options`.
- Internal members (anything that starts with an underscore) are not part of the types.
