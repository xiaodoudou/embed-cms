# Changelog

What changed in each version of Embed CMS, from 3.0.0 on, newest first. The versions follow [semantic versioning](https://semver.org); the headings follow [Keep a Changelog](https://keepachangelog.com). The **Unreleased** section gathers what is on `main` and not yet published to npm.

## [Unreleased]

### Added

- **A mask can force the case of the letters.** `options.maskCase: 'upper'` or `'lower'` on a `string` with an `options.mask` writes the letters typed or pasted in capitals or in small letters (`AA-___-AA` with `'upper'` turns `ad232da` into `AD-232-DA`). See [string](docs/reference/fields/string.md#mask).
- **`cms-backup` and `cms-restore`.** Two modes: `files` copies the data folder of a stopped server and keeps every `_id`; `api` reads a running server over REST and writes a payload (`content.json` and `files/`) that `cms-load` replays, with new `_id`. See [BACKUP.md](docs/operations/BACKUP.md).
- **Agent skills.** `skills/` holds eight skills in the Agent Skills format (create a site, model, add, patch and load content, back up, sync, go to production). The `cms-skills` command installs them into `.agents/skills` or `.claude/skills`, and `.claude-plugin/` lets Claude Code install them as a plugin. See [skills/README.md](skills/README.md).

## [3.0.5] - 2026-10-07

### Added

- **Docker example.** `docs/examples/docker` runs embed-cms in a container with every secret in a `.env`. The image holds no secret. A `compose.yaml` hands the `.env` to the container, which runs read-only and is published on `127.0.0.1` only. Three scripts make the `.env` with random values, build the image and check it holds no secret, and start the container.
- **Docs platform example.** `docs/examples/platform` hosts the docs of several products, one version at a time. The CMS is not on the public site: editors use a second port. Some products and pages are for members only, and one rule decides who may read a page, its files and the search. Members sign in with passwords that nobody can read back.
- **Boardwalk example.** `docs/examples/taskboard` is a task board in Vue 3 that uses the REST API. It shows a login the app never sees, writes that show at once and are taken back if the CMS refuses them, real time over the websocket, and drag and drop. About 270 tests, down to the real CMS.
- **Every example is tested.** One suite checks that each example's resources are accepted, its content loads twice with nothing to do, a crawl finds no broken link, and its `server.js` starts, serves and starts again. The example servers take `PORT` and `STATE_DIR`.

### Removed

- **The two loose sample files of the import from remote** (`docs/examples/importFromRemote-example*.json`). They named resources of an old project. [IMPORT.md](docs/operations/IMPORT.md) has the same configuration.

### Fixed

- **A CMS stopped by a signal exited with code 1.** `process.on('SIGTERM', cms.shutdown('SIGTERM'))` passes the signal name to the handler, which took it for an error. So `docker stop`, systemd and other supervisors saw every clean stop as a failure. A signal now exits with 0, and only an `Error` exits with 1.
- **A foreign site could change a signed-in person's theme, start an import or sign them out.** It only had to write the address with capital letters. The cross-site check now ignores case, and it also covers `/admin/logout`, which had no check at all.
- **A group that could only add files could also write and delete records.** The CMS took any address containing `/attachments`, even in the query string (`PUT /api/articles/<id>?x=/attachments`), for a request about files. It then checked the `attachments` right instead of `create`, `update` or `remove`. The route that matched now decides. Two related fixes: `_createdBy` can no longer be set from the request, and REST ignores `_attachments` in a new record, as it already did on update.

## [3.0.4] - 2026-10-06

### Added

- **Examples in the docs.** `docs/examples` has a runnable blog and a runnable magazine, each with a tutorial, a sitemap and screenshots, and a page on the ideas a project needs.
- **The magazine example.** `docs/examples/magazine` is a bilingual (English and Chinese) magazine built with plain Express and `cms.api()`, with no helper. It has relations, covers resized by the API, a search, an RSS feed, a sitemap, and 404 and error pages. 42 tests run it.
- **ContentLoader and `cms-load`: content and files from a JSON file.** `new CMS.ContentLoader(cms).load('./content.json')` writes the records of each resource through `cms.api()`.
  - `authors://mei-lin` points to a record by its unique field. `attachment://files/cover.jpg` adds a file.
  - The loader checks everything first and reports each problem with its place. If anything is wrong, it writes nothing.
  - You can run it again. It changes only what differs and never deletes. `dryRun` reports without writing.
  - The `cms-load` command runs it from a terminal. Exit codes: 0 done, 1 problems in the content, 2 wrong command, 3 the CMS or the system failed.

  See [CONTENT_LOADER.md](docs/operations/CONTENT_LOADER.md).
- **PageHelper: the pages of a public site, from the content.** `new CMS.PageHelper({ cms, templates })` renders Mustache templates and keeps the finished pages, in memory or in a folder. A kept page is made again when a template file, or a record it read, changes. It also renders 404 and error pages. See [PAGE_HELPER.md](docs/reference/PAGE_HELPER.md).
- **Jump to field has a search box and a shortcut.** Type some letters of a name and only the matching fields stay, best match first. Ctrl+J (Cmd+J on a Mac) opens the menu from anywhere in the form. See [Jump to a field](docs/reference/FIELDS.md#jump-to-a-field).
- **Groups that close, start closed, and have a layout.** In the `groups` of a resource, `collapsible: true` lets a group open and close, `collapsed: true` starts it closed, and `layout: { lines }` puts its fields side by side. A layout of a resource or block type can now place a group, and a block type can describe its groups in its own file. A nested group is now named by its whole path (`'social.profiles'`). A title given for only the last part (`profiles`) no longer applies. See [Groups](docs/reference/FIELDS.md#groups).
- **Your own translations of the admin.** Put one file per language in an `i18n` folder next to `cms.json` (for example `./i18n/frFR.json`), with only the words that are yours. The admin uses the CMS words with yours over them. Before, an `i18n` folder replaced the CMS's own. See [Translations](docs/reference/CONFIG.md#translations).
- **Names for about ninety languages, and a resource with ten.** The language switch and the table named only four languages, so others showed a key such as `TL_JAJP`. The CMS now names about ninety languages and regions, and shows a language by its code when it has no name.
- **Radio and segmented fields.** `input: 'radio'` and `input: 'segmented'` choose one value from a short list that is always in view. See [segmented](docs/reference/fields/segmented.md) and [radio](docs/reference/fields/radio.md).
- **A geopoint field.** `input: 'geopoint'` keeps a place as `{ lat, lng }`. You type it in two boxes, or click **Pick on map** to use a map (Leaflet with OpenStreetMap tiles: no key to set up). The new `maps` option points the map at your own tile server and search, or turns it off with `maps: false`. See [geopoint](docs/reference/fields/geopoint.md) and [Maps](docs/reference/CONFIG.md#maps).
- **A date range field.** `input: 'daterange'` picks a start and an end on one calendar and keeps `{ start, end }` in milliseconds. Options include `time`, `minDate`, `maxDate`, `minDays` and `maxDays`. See [daterange](docs/reference/fields/daterange.md).
- **A markdown field.** `input: 'markdown'` is a text box with a toolbar and a preview. The renderer never runs the text: HTML in it is shown as text, and links go only to safe addresses. See [markdown](docs/reference/fields/markdown.md).
- **Templates for text boxes.** A `string` with `options.mask`, such as `'(___) ___-____'`, keeps its template in the box as you type. A `duration` has its own `options.template`. See [string](docs/reference/fields/string.md#mask).
- **A dropdown of records from several resources.** A `select` or `multiselect` with `sources: [...]` lists the records of all of them in one drop-down, and keeps `{ resource, id }`. See [select](docs/reference/fields/select.md).
- **A phone field.** `input: 'phone'` has a country list and a box for the national number, and keeps the international form (`+442071838750`). See [phone](docs/reference/fields/phone.md).
- **A money field.** `input: 'money'` keeps `{ amount, currency }`, with the decimals of the currency. See [money](docs/reference/fields/money.md).
- **A duration field.** `input: 'duration'` is one box with a template such as `__:__`, and it reads pasted values like `1h 30m`. See [duration](docs/reference/fields/duration.md).
- **A rating field.** `input: 'rating'` is a row of icons (stars, hearts and others) that you click or move over with the arrow keys. See [rating](docs/reference/fields/rating.md).
- **An image map field.** `input: 'imagemap'` is an image field with clickable areas (rectangles, circles and polygons) laid over the picture. Each area has a title and a link. See [imagemap](docs/reference/fields/imagemap.md).
- **A crop image field.** `input: 'cropimage'` is an image field with a crop tool. The picture is kept as uploaded, the crop is stored as a recipe, and the API cuts the image when asked, so you can change the crop at any time. An **Auto** button places the frame where smart cropping would. See [cropimage](docs/reference/fields/cropimage.md).
- **Sync of every resource at once.** The Sync page has **Push all** and **Pull all**. The same run starts from code (`cms.$sync.run`, `cms.$sync.runAll`), from the `cms-sync push|pull` command, over HTTP, or on a cron schedule (`sync.schedule` in `cms.json`). See [SYNC.md](docs/operations/SYNC.md).
- **Resources to sync are chosen in the admin.** The Sync settings offer the resources in a drop-down. The `sync.resources` list of the configuration is a fallback until some are chosen.
- **Sync of files and blocks.** Attachments sync file by file: a file that is the same is left alone, and one the source no longer has is removed. Relations and files inside the blocks of a `paragraph` field sync too. A record id written in a text or a JSON value is followed to the same record on the other CMS.
- **Resolving relations from code.** `cms.api()('comments', 'authors')` returns records with the records their `select` fields point to, in place of the ids.
- **Bulk writes from code.** `api('articles').bulk(async () => { ... })` runs many writes with one wait for the disk at the end. The sync and the import use it.
- **A Jump to menu on every record form.** It lists the fields and the blocks, marks what changed, and shows where it jumps to.
- **Layout examples** in the field catalogue: tiles in a grid, and fields on lines of a form.
- **A Today button on date fields.** It sets the start of the day, like picking the day in the calendar.
- **Docs.** Screenshots of the new fields, a walkthrough of a sync on one machine, and this changelog.

### Changed

- **On a phone, the language of a record is one button.** The tabs took too much room: ten languages took 212 px, and four took two rows. One 44 px button next to Back shows the language being edited and its markers, and opens a list when there are more than two. On a phone Back is its arrow alone and "Unsaved changes" is not written, so the bar of a new record is one line. See [DESIGN_SYSTEM.md](docs/extending/DESIGN_SYSTEM.md).
- **A phone on its side uses the phone layout.** At 812 by 375 px it got the tablet layout, which left about 150 px of height to the form. A touch screen under 500 px high now gets the phone layout, and the form has 251 px of the 375 px screen. Tablets and computers are unchanged.
- **Image and file fields on a phone.** The previews were 200 px cards with the rest of the line empty, and the grip to drag one was 22 px. In an editor under 480 px wide, each preview now takes the whole line, and on a touch screen the grip is 44 px.
- **Block fields on a phone.** The block type and the Add button were stacked at the edge of the bar, and the grip to drag a block was 28 by 18 px. They now share one line, and the bar and grip are 44 px on a touch screen.
- **Form layout lines stack in a narrow editor.** On a phone, and on a tablet where the editor shares the screen with the list, the fields of a `layout.lines` line were squeezed side by side. Below 480 px, each field now takes a whole line. See [FORM_LAYOUT.md](docs/reference/FORM_LAYOUT.md).
- **The record editor keeps its room on a phone.** The breadcrumb, the card margin and a three-line bar took 228 to 267 px before the first field. Under 600 px wide the breadcrumb is hidden, the card fills the page, and the action bar is two lines. The form has 636 px of an 812 px screen, up from 520 px.
- **The log page shows the real output of the CMS on Windows and macOS** when `syslog` is not set, instead of made-up lines. The CMS keeps what it prints in memory and shows it. `syslog.method: 'console'` asks for the same on any system. On Linux nothing changes. See [Logs](docs/reference/CONFIG.md#logs).
- **The `crop` option of an image field** uses the new crop tool and the same recipe. A crop that hangs over the picture is cut to it instead of failing, and a picture turned by its EXIF orientation is cropped as it is shown.
- **Writes are much faster in bulk.** Every write waited for the disk (4 ms each). Inside `bulk`, in a sync and in an import, they wait once at the end: 2000 creates take 0.3 s instead of 8 s, and a sync of 2000 records takes 4.8 s instead of 13.6 s. A unique field is now checked against an index in memory instead of a scan: 2000 creates with a unique field take 0.3 s instead of 3.5 s.
- **Sync compares in linear time.** It finds the records of each side by their unique key instead of searching the other side for every record.
- **Admin look.** A deeper indigo primary colour, drop-down menus edge to edge, a lock icon for read-only fields and no icon for disabled ones, and an uploads panel as wide as the toasts.
- **A file dropped on a paragraph field** reaches the file field of its new block as data, instead of a search through the page.
- **Keyboard shortcuts are a directive of the admin** (`v-shortkey`, in `src/utils/shortkey.js`) instead of `vue3-shortkey`. That package printed its debug output and came from a fork as a tarball. Now nothing is fetched outside the npm registry, and npm 12 installs the package. Ctrl+P, a second shortcut for the switcher that the library had added, is gone: the switcher is Ctrl+K.
- **Code clean-up.** Every function of the backend and the admin has a doc comment. Names that said the wrong thing were replaced, for example `getDateTomorrow` is now `tokenExpiresAt`. Two unused functions were removed. The backend driver context is a Node `EventEmitter`. `prefer-const` and `eqeqeq` are enforced on the admin and the backend.

### Fixed

- **Jump to field left out the fields of a group.** The menu listed only the fields outside any group, so a form made of groups showed a few rows or none. A required field inside a group was also never marked as missing after a failed save. The menu now lists every field, with grouped fields named after their group (`Address · City`), in the order the form draws them.
- **A slug field without `options.valueFrom` filled the console with warnings.** It warned at every change of the record, so a form could print hundreds. It now warns once, when the field is made, and names the field. The Slug of the Languages resource now has its source and can be edited.
- **The pills of the editor bar were 3 px apart.** "Unsaved changes" and "N required fields missing" sat on the baseline of their own text, so one was lower than the other. They are now centred on one line. The language tabs also make room for their markers before they give way to the button: four languages with markers take about 450 px, not 340.
- **The geopoint map on a short or narrow phone.** On a 320 by 568 px screen, in landscape, with the keyboard up, or at 200% text, the Cancel and Use this point buttons were below the fold, and panning the map made the card hard to scroll. The card now keeps its title and foot in view and scrolls in the middle. On a touch screen the zoom buttons, the search box and the pin are 44 px, and in landscape the map takes the room.

## [3.0.3] - 2026-10-02

### Added

- **Plugin UI kit and host object** for admin plugins: the CSS-only kit (`dist/kit.css`, the public tokens, the Design system sections that draw them) and `window.embedCms.host` (also `this.$admin` and `useAdmin()`), what a plugin page receives ([docs/extending/PLUGIN_UI_KIT.md](docs/extending/PLUGIN_UI_KIT.md)).
- **Record author:** `_createdBy` on records created over REST, beside `_updatedBy`.
- **Rights in the login status** (`/admin/login`), so the admin knows what the person may do before it asks.
- **Object fields** validated against their JSON schema; the All / Me toggle and compact rows in the record list; the locale switch; the read-only and disabled looks of every field; the code editor theme.
- **Tests:** the frontend suite for the new admin parts, the OSS attachment tests, a driver contract suite that runs the same tests against MongoDB and PostgreSQL, the security configuration tested against SECURITY.md, and the tests that keep the docs honest (one line per paragraph, links that resolve, the classes the kit page names).
- **Benchmark** of the whole CMS on all five storage engines ([docs/operations/STORAGE.md](docs/operations/STORAGE.md)).

### Changed

- **Vuetify 4**, with the tokens, base, reset and primitives as SCSS; the Vite build also writes `dist/kit.css`; the lint, knip, test and CI configuration and the npm scripts for the benchmarks, the docs and the screenshots.
- **The server code regrouped by what it does:** `lib/db` with the JSON, SQLite and LevelDB stores and the migration between them, the plugins, the importers, the `cms` command in `bin`. The types describe the host object and the options.
- **The docs reorganised** by purpose (start, reference, operations, extending, contributing) with fresh screenshots.

### Fixed

- Three OSS (object storage) attachment fixes: the key of an upload without a file name, a read that honours the disk method, a replaced picture deleted from OSS.
- The drop zone of a file field shows its text once.

## [3.0.2] - 2026-10-01

### Changed

- `vue3-shortkey` is a development dependency, fetched as a tarball instead of from git, so an install of the package needs no git.
- **Release workflow:** a version tag runs the tests, publishes to npm and creates the GitHub release.

## [3.0.1] - 2026-10-01

The first version on npm, as `embed-cms`.

### Added

- **Rebrand:** node-cms becomes Embed CMS, with a new logo.
- **The admin follows the person:** theme, language and the title of the tab come from their account; the language switch is gone.
- **System card:** live network traffic, not the total since boot.

### Changed

- **No-login mode works:** the admin opens, has something to show, and signs what it writes.
- **Choosing several records:** a click on a row adds or removes it, and the selected chips are not faded.
- **Record list:** no colour fade on a row; the scrollbars of the admin look like the system's.
- **Omnibar:** Tab stays in the switcher instead of leaving for the page behind.
- **Login page:** a softer, more finished look, still following the system theme.
- **Object and list editor:** a flat redesign in the language of the admin.
- **Text fields** ask browsers not to autocomplete, so Brave stops offering an email alias on emails and links.
- **Dependencies:** `@vuepic/vue-datepicker` 14 (and `date-fns` 4, now a direct dependency), `vue-virtual-scroller` 3, `chai` 6, `rollup-plugin-visualizer` 7 (loaded only for `ANALYZE=1 npm run build`).
- **Docs** reviewed against the code and the changes since 3.0.0.

### Fixed

- **Syslog:** a very long log no longer fills the disk, the memory or a stalled page.

### Removed

- The Cms Config page and its routes; Syslog is listed in the CMS menu instead.

## [3.0.0] - 2026-10-01

The release that turned node-cms into a project that stands on its own: the first since 2.6.1 (March 2026), and the last under the name node-cms. Versions up to 2.6.1 were MIT; from 3.0.0 the license is the GNU GPL version 3 only (the license file keeps the MIT notice of the earlier versions).

### Added

- **Record stores:** LevelDB and SQLite beside the JSON file, MongoDB and PostgreSQL (`dbEngine.type`). LevelDB is the default for new content; a resource that still has a `db.json` keeps it until it is moved with the migration tool. A storage engines page with measurements and a crash test, and a benchmark of the whole CMS on all five engines.
- **The admin redesigned:** a design system with tokens in both themes, a collapsible navigation rail, a record editor that tracks unsaved changes, dialogs, toasts and an uploads panel, the table view, consistent field states, the open record in the address, Ctrl+K to jump to a resource or a plugin, breadcrumbs, settings menu icons, a reworked log page, compact toasts and list rows.
- **The field catalogue:** one example resource per family of field types, and one documentation page per field type with every variation and a screenshot.
- **Colorized console logs:** timestamps, levels by severity and highlighted values on a terminal, plain text in files and pipes, `NO_COLOR` and `FORCE_COLOR`; the System log page shows the colours.
- **Tests and CI:** backend unit and security tests (mocha), frontend component tests (vitest) that mount the real components with Vuetify, coverage, and a GitHub Actions workflow that runs them with the lint and the build.
- **Documentation:** a README that goes from nothing to a running CMS, a map of the docs, architecture, concepts and contributing pages, one configuration reference, the API, the plugins and every field page rewritten against the code, diagrams in Mermaid, and the recommended production configuration, documented and tested.

### Changed

- **Security on by default:** every protection is on and the legacy profile is gone: stronger authentication and sessions, HTTP headers, CSRF, one JSON body limit with a clear `413`, authenticated and validated replication, query safety. See [SECURITY.md](SECURITY.md).
- **Smart cropping** uses sharp's attention strategy: no AI model, every TensorFlow trace removed.
- **Dependencies:** every upgrade that fits, eslint 10 among them. The project no longer depends on its former owner's services.
- **Saving a record:** the record is saved before its files, saving is refused while a required field is empty, uploads without an extension keep their type, switches are saved as `false`.
- **License:** GPL-3.0-only, where versions up to 2.6.1 were MIT.

### Removed

- The legacy security profile: there is one, hardened, configuration.
- The AI model of the smart cropping and every TensorFlow trace.
- The private logger dependency, `canvas`, `rollup-plugin-node-polyfills` and the unused packages.
- The bug and audit notes that lived in the docs, now that tests cover them.

### Fixed

- The 39 bugs found while the docs were checked against the code, each with a regression test: among them, the login page and the admin agree on the theme, the `cms` command is a plain CMS in a project, installs from git come with the admin built, `?locale=` stores values field first, and syncing one record checks it.
- The bugs the component tests found: a new record opens a blank editor again, a refused request is not logged as a server error, record names and labels after the mustache 4 update, a record whose id overlaps the machine id can be changed and removed, and `remove` and `update` throw instead of failing silently.
- A delete goes to the replication peers right away again, `cms-import` prints no empty progress bars into logs, the xlsx import answers `400` without a file.

[Unreleased]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.5...HEAD
[3.0.5]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.4...v3.0.5
[3.0.4]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.3...v3.0.4
[3.0.3]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/xiaodoudou/embed-cms/releases/tag/v3.0.0
