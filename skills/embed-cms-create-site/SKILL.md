---
name: embed-cms-create-site
description: Create a new website on embed-cms (Node.js CMS with an admin, REST API and Mustache page rendering). Use when the user wants to start, scaffold or bootstrap a site, blog, magazine or app backend with embed-cms, or add embed-cms to an existing Express project.
---

# Create a website with embed-cms

embed-cms is an Express app you mount inside your own server. The content model is one JS file per resource. The public pages are yours: the `PageHelper` renders Mustache templates and keeps the finished pages.

The docs are in the `docs/` folder of https://github.com/xiaodoudou/embed-cms, not in the npm package. Start from `docs/start/GETTING_STARTED.md` and copy from a runnable example: `docs/examples/site` (the shortest) or `docs/examples/magazine` (relations, pictures, two languages, search, feed, sitemap).

## Steps

1. **Ask only what you need**: what the site is for, the content types, one language or several (`enUS`, `zhCN`). Node must be `^22.12.0`.
2. **Scaffold** in the project folder:
   ```sh
   npm init -y && npm install embed-cms express
   ```
3. **`server.js`**, with the CMS and the site in one process:
   ```js
   const path = require('path')
   const express = require('express')
   const CMS = require('embed-cms')

   const view = (f) => path.join(__dirname, 'views', f)
   // mid: exactly 8 characters, never change it later. disableReplication: a single server does not replicate
   const cms = new CMS({ mid: 'webnode1', disableReplication: true, anonymousRead: ['articles'] })
   const pages = new CMS.PageHelper({
     cms,
     templates: { header: view('header.html'), footer: view('footer.html'), home: view('home.html'), notfound: view('notfound.html'), error: view('error.html') },
     notFound: 'notfound',
     error: 'error'
   })

   const app = express()
   app.use(cms.express()) // /admin, /api
   app.get('/', pages.route('home', async ({ api }) => ({ articles: await api('articles').list({ published: true }) })))
   app.use(pages.notFoundHandler())
   app.use(pages.errorHandler())

   const server = app.listen(process.env.PORT || 3000, async () => {
     await cms.bootstrap(server) // pass the HTTP server: the admin uses its websocket
     console.log('ready')
   })
   process.on('SIGINT', cms.shutdown('SIGINT'))
   process.on('SIGTERM', cms.shutdown('SIGTERM'))
   ```
4. **Resources** in `resources/<name>.js` (skill `embed-cms-model-content`). Add a `unique` field (such as a slug) to the resources that pages, loads or syncs look up by key; the others are identified by `_id`.
5. **Templates** in `views/`. Mustache has no code, so the loader prepares dates, names and the rest (`articles.map(present)`). Include `{{> header}}` and `{{> footer}}` in every page, the 404 and error pages too. For a picture, use the attachment URL with a size: `/api/<resource>/<id>/attachments/<aid>?resize=640xauto` (add `&smart=true` to keep the interesting part), and build a `srcset` from several widths in the loader.
6. **Several languages**: give the resource `locales`, serve one path per language (`/en/...`, `/zh/...`) and let the loader read `title[locale]`. The magazine example shows the routes, search, feed and sitemap. Keep the language in the path: a kept page is one per path (and per `vary` query parameter), so a language chosen by a cookie would show the first visitor's page to everyone.
7. **First content**: write `content/content.json` and load it (skill `embed-cms-load-payload`).
8. **Run** `node server.js`, **wait for `ready`**, then open `/admin` (`localAdmin` / `localAdmin`, development only). Add a record, tick Published, reload the site.

## Rules that bite

- The server answers a moment before `bootstrap` finishes, and until then even a public `GET /api/...` answers 401. Wait for `ready` before you test.
- Resource files are read at start-up: **restart after changing one**.
- In a loader, read through the `api` it is given, not `cms.api()`, or the kept page does not know what to refresh on.
- `cms.api()` and the PageHelper check **no rights**: filter `published: true` in the loader.
- Public REST reads need `anonymousRead: [...]`. Always send `limit`; there is no sort parameter, so sort in code.
- Mustache skips `0`, so a page number `0` needs a flag of its own (`hasPrevious`).
- `{{{raw}}}` only for HTML an editor wrote. Never read cookies or the user in the loader of a kept page; give that route `cache: false`.
- `cms.json` is written on first boot and is yours after that; a constructor value always wins over the file. Keep `data/` and `cms.json` out of git.
- Before real users: skill `embed-cms-go-production`.

Finish by running the site, fetching one page and `/api/<resource>`, and reporting what you saw.
