# Known bugs

These are bugs found while the documentation was checked against the code (October 2026). None of them is fixed yet:
this page records them so nobody has to find them twice, and so the docs can point here instead of describing broken
behaviour as a feature.

Each entry says what happens, where in the code, and how we know: **seen** means reproduced against a running CMS,
**read** means established by reading the code. Line numbers are those of the commit this page was written on.
Interface problems are in [UI_BUGS.md](UI_BUGS.md).

Each entry links to its GitHub issue. When you fix one, add a regression test, remove the entry in the same commit, and close the issue from the commit message (`Fixes #N`).

## Start-up and configuration

**`cms` crashes in a folder without a `package.json`.** *Seen.* [#13](https://github.com/xiaodoudou/node-cms-private/issues/13) `lib/plugins/admin/index.js:12` requires
`<current folder>/package.json` when it loads, so running the `cms` command in an empty folder, as the old README
suggested, ends with `Cannot find module …/package.json`. Workaround: run it in a folder that has one (`npm init -y`).

**The `cms` command writes development options into a new project.** *Seen.* [#14](https://github.com/xiaodoudou/node-cms-private/issues/14) `server.js:35-49` hard-codes
`sync: { resources: ['articles', 'comments', 'authors'] }`, `disableReplication: true` and `smartCrop: false`. On a first
run they are merged into the generated `cms.json`, which turns on the sync plugin for resources the project doesn't have.

**Building the admin as a dependency needs a `node-cms/plugins/` folder in the project.** *Seen.* [#15](https://github.com/xiaodoudou/node-cms-private/issues/15) When node-cms is in
`node_modules`, `vite.config.js:65` points the `@p` alias at `<project>/node-cms/plugins` unconditionally, while
`vite.utils.js` falls back to the bundled `src/.plugins` when that folder is missing. The build then fails with
`Could not load …/node-cms/plugins/js/main.js`. Workaround: copy `node_modules/node-cms/src/.plugins` to
`node-cms/plugins`. Also, `dist/` is ignored by git and there is no `files` field or `prepare` script, so an install from
git or a packed tarball has no built admin at all until you build it.

**A missing `dist/` can stop the server.** *Read.* [#16](https://github.com/xiaodoudou/node-cms-private/issues/16) `serveTemplate` (`lib/plugins/admin/index.js:154`) reads
`dist/index.html` synchronously inside an async handler. Without `npm run build`, opening `/admin` logs an `ENOENT`, and the
resulting unhandled rejection can reach the `uncaughtException` handler of `server.js`, which shuts the process down.

**The syslog `command` method never runs its command.** *Read.* [#17](https://github.com/xiaodoudou/node-cms-private/issues/17) `SyslogManager.init` (`lib/SyslogManager.js:48-54`) only
calls `startSysLogCapturing`, the one place that spawns `syslog.command`, for the `syslog` and `journalctl` methods. A
`command` configuration lands in `startVirtualSysLog`, which treats it as an unknown method.

**The admin languages can't be configured the way the server serves them.** *Read.* [#18](https://github.com/xiaodoudou/node-cms-private/issues/18) `/admin/i18n/config.json` answers
`options.admin`, defaulting to `{ language: {…} }` (`lib/plugins/admin/index.js:373`), but the admin reads
`config.language` inside it (`src/services/TranslateService.js:16`). With the default shape the admin only ever loads
English. To offer Chinese today you have to write `"admin": { "config": { "language": { "defaultLocale": "enUS",
"locales": ["enUS", "zhCN"] } } }`.

## REST API

**An unknown record id answers `200 null` instead of `404`.** *Seen.* [#19](https://github.com/xiaodoudou/node-cms-private/issues/19) `json_store.find` swallows the not-found error
(`lib/db/json_store.js:164-171`) and `routes.find` sends `res.json(null)` (`lib/plugins/rest/routes.js:179-181`). The
comment in `test/unit/drivers.contract.test.js:139` says the REST layer turns this into a 404; it doesn't.

**A rejected query answers `500` with an HTML page under the `legacy` profile.** *Seen.* [#20](https://github.com/xiaodoudou/node-cms-private/issues/20) `parse_query` passes the
error to `next(err)`; the error carries `code: 400` but no `status`, and the JSON error handler is only installed with
`security.uniformErrors` (`index.js:381-384`). `?query={"$where":"1"}` or malformed JSON returns Express's HTML error
page, with a stack trace outside production.

**The original file name of an upload is lost.** *Seen.* [#21](https://github.com/xiaodoudou/node-cms-private/issues/21) `lib/resource.js:748` overwrites the name multer read from the
upload (`routes.js:338`) with the temporary file's random name. Unless the client sends a `_filename` text part (the admin
does), `_filename` is a random hex string, and the content type is guessed from that extensionless name.

**`?locale=` on a create stores the wrong shape and drops fields.** *Seen.* [#22](https://github.com/xiaodoudou/node-cms-private/issues/22) `normalizeSchema` (`lib/helpers.js:298-319`)
stores `{ enUS: { title } }`, while the admin, the xlsx export and the queries all use `{ title: { enUS } }`. It also drops
every key that isn't in the schema, `_updatedBy` included.

**The REST body limit of 50 MB never applies.** *Seen.* [#23](https://github.com/xiaodoudou/node-cms-private/issues/23) The authentication plugin parses JSON for every route first, with
`security.limits.json` (100 KB by default), so the rest plugin's own `bodyParser.json({ limit: '50mb' })`
(`lib/plugins/rest/index.js:56`) never sees a body. A 200 KB record answers `413`. Raise `security.limits.json` if you need
larger records.

**Foreign records: a refused delete still deletes the files.** *Read.* [#24](https://github.com/xiaodoudou/node-cms-private/issues/24)
Since `0008663`, `json_store.update` and `remove` throw for a record another node created, and REST answers `403`. But the
before-hooks of `remove` and `removeAttachment` delete the attachment files (`lib/resource.js:693-722, 956-966`) before the
store refuses, so a refused delete leaves the record pointing at files that are gone.

**Resized and smart-cropped images share a cache key.** *Read.* [#25](https://github.com/xiaodoudou/node-cms-private/issues/25) The driver resizes and caches the image
(`lib/util/driver/index.js:1108-1192`), then `routes.findAttachment` resizes it again with its own cache, keyed
`<aid>-<size>` without the smart flag (`lib/plugins/rest/routes.js:263-296`). A smart request can return a plain resize
that was cached earlier, or store a smart crop under the plain key. `?smart=false` also counts as true (the value is a
string), and `facePadding` is not part of the smart cache key.

**`find` changes the options object it is given.** *Read.* [#26](https://github.com/xiaodoudou/node-cms-private/issues/26) `_findImpl` does
`_.extend(params.options || {}, { page: 0, limit: 1 })` (`lib/util/driver/index.js:891`), so a caller that reuses its
options object for a later `list` gets one record.

**`cleanAttachmentCache` returns before it is done.** *Read.* [#27](https://github.com/xiaodoudou/node-cms-private/issues/27) It neither awaits nor returns its `pAll`
(`lib/util/driver/index.js:795`), so an `await` on it finishes before the cache files are removed.

**A latent infinite recursion.** *Read.* [#28](https://github.com/xiaodoudou/node-cms-private/issues/28) The array branch of `injectAttachmentUrl` calls itself with the same array
(`lib/plugins/rest/routes.js:28-31`). No current caller passes an array.

## Plugins

**Smart cropping never detects anything.** *Read.* [#29](https://github.com/xiaodoudou/node-cms-private/issues/29) `initialize()` in `lib/util/smartcrop.js:35-48` has the model
loading commented out, and `this.loadImage` is only set inside that dead code, so `smartCrop()` throws and `applyCrop`
falls back to a centre crop on every call, logging errors. The TensorFlow packages and the `tf/` folder the old docs
referred to are not in the repository. `lib/resource.js:783` also checks a `targetSize` that `smartCropAttachment` never
returns, so the re-resize after a smart crop at upload never runs.

**Sync: the automatic push after a change never registers.** *Read.* [#30](https://github.com/xiaodoudou/node-cms-private/issues/30) `initHookAfter` (`lib/plugins/sync/index.js:64-104`)
calls `this.api('_sync').list()`, which returns an array, then reads `syncConfig.resources` and `syncConfig.remote.url`
from it. Both are undefined, so no hook is installed. The rest of the file uses `find({})`.

**Sync: a failed sync can shut the server down.** *Read.* [#31](https://github.com/xiaodoudou/node-cms-private/issues/31) `onPutSyncResource` starts `startSyncData` without `await` or
`.catch` (`lib/plugins/sync/index.js:409`), and `startSyncData` rethrows (line 601). The unhandled rejection reaches the
`uncaughtException` handler of `server.js`.

**Sync: the proxy routes need no token.** *Read.* [#32](https://github.com/xiaodoudou/node-cms-private/issues/32) `GET /sync/local/:resource`, `GET /sync/remote/:resource` and their
`/status` (`lib/plugins/sync/index.js:34-36, 271-286`) only check that the configuration has a token, then fetch with the
stored one. `/sync` is not in `routesToAuth`, so anyone who can reach the server can read the synced resources through it.
A refused write also answers with the message "read data is not allowed" (line 399).

**Replication: syncing one record syncs the whole resource.** *Read.* [#33](https://github.com/xiaodoudou/node-cms-private/issues/33) `syncRecord` passes the record id to
`json_store.sync(socket, slave, remoteId)`, which takes no record id (`lib/plugins/replicator/replicator.js:106`,
`lib/db/json_store.js:101`).

**The Google Sheets import command doesn't work.** *Read.* [#34](https://github.com/xiaodoudou/node-cms-private/issues/34) `cms-import` calls `doc.useServiceAccountAuth`
(`import.js:177`), which google-spreadsheet 5 no longer has (the in-admin import plugin was updated, the command was not),
and sends the credentials as `username` and `password` headers instead of a Basic `Authorization` header (`import.js:745`).
Its `-c` option has the help text of `-s`.

**Both import commands build `/undefined/api` without a `prefix`.** *Read.* [#35](https://github.com/xiaodoudou/node-cms-private/issues/35) `lib-import/api.js:11` and
`lib-importFromRemote/api.js:22` concatenate `prefix` unconditionally.

**`/importFromRemote/execute` blocks until the import ends.** *Read.* [#36](https://github.com/xiaodoudou/node-cms-private/issues/36) The handler awaits the whole import before
answering `{ status: 'started' }` (`lib/plugins/importFromRemote/index.js:68-86`), despite a comment saying it doesn't.

## Authentication and admin

**The Cms Config page always answers 403 with Basic authentication.** *Read.* [#37](https://github.com/xiaodoudou/node-cms-private/issues/37) `isAdminUser`
(`lib/plugins/admin/index.js:180-187`) reads `req.user.group`, which nothing sets on `/admin/cms-config`: the route is not
in `routesToAuth` and has no Basic check of its own. The page works with the JWT login only.

**A wrong Basic password on `/admin/` doesn't prompt again.** *Read.* [#38](https://github.com/xiaodoudou/node-cms-private/issues/38) `onGetRootBasicAuth` calls `next(error)` with
`{ code: 401 }` (`lib/plugins/admin/index.js:243-247`). Express ignores `code`, so the `legacy` profile answers 500; the
`hardened` one answers a JSON 401 without `WWW-Authenticate`, so the browser doesn't show its login prompt again.

**With both login modes on, the admin's API calls run as anonymous.** *Read.* [#39](https://github.com/xiaodoudou/node-cms-private/issues/39) With `disableJwtLogin: false` and
`disableAuthentication: false`, `cookieParser` is not installed (`index.js:327-329`) and the REST `authorize` middleware
doesn't look at the session's token (`lib/plugins/rest/middleware/authorize.js:39`). Use one mode at a time (see
[CONFIG.md](CONFIG.md#authentication)).

**Without authentication, the admin page keeps its placeholders.** *Read.* [#40](https://github.com/xiaodoudou/node-cms-private/issues/40) No `GET /admin/` handler is registered when
both modes are off (`lib/plugins/admin/index.js:52-59`), so `dist/index.html` is served as is and the tab title reads
`__TITLE__`.

**Dead code in the authentication plugin.** *Read.* [#41](https://github.com/xiaodoudou/node-cms-private/issues/41) `_.each(schemas._groups, …)` loops over the keys of the declaration
object and uses an undefined `this._resourceNames` (`lib/plugins/authentication/index.js:909-913`). The admin fills those
options itself. `onGetResources` compares `routesToAuth` entries with `'resources'`, which never matches `/admin/resources`
(`lib/plugins/admin/index.js:424`).

**Dynamic layout: the tablet rule only matches one width.** *Read.* [#42](https://github.com/xiaodoudou/node-cms-private/issues/42) `ParagraphView.vue:1197-1207` targets items with
attribute selectors such as `[style*="flex-basis: calc(8.33%"]`, but the computed values are `8.333333333333332%` and
`16.666666666666664%`. Only the 3-of-12 (25%) case can match.
