# Changelog

What changed in each version of Embed CMS, from 3.0.0 on, newest first. The versions follow [semantic versioning](https://semver.org); the headings follow [Keep a Changelog](https://keepachangelog.com). The **Unreleased** section gathers what is on `main` and not yet published to npm.

## [Unreleased]

### Added

- **A dropdown of the records of several resources.** A `select` or a `multiselect` with `sources: ['authors', { resource: 'editors', customLabel: '{{name}} ({{role}})', title: 'Editors' }]` lists the records of all of them in one drop-down, in a group for each resource, each by its label, and keeps `{ resource, id }` (an id alone does not say which resource it is of). A reference to a record that is gone is shown by its id and marked as not found; the table and the record names show the record by its label. From code, `cms.api()('pages', 'authors', 'editors')` resolves the references into the records, each with `_resource`; import files, spreadsheets and sync name the record by its first `unique` field, and sync points it to the same record on the other CMS. See [docs/reference/fields/select.md](docs/reference/fields/select.md).
- **A phone field,** `input: 'phone'`: a country chosen from a list (found by name in the language of the admin, by code or by calling code, with its flag) and the national number in a box, kept in the international form (`+442071838750`). A number typed or pasted with its country (`+44 20 7183 8750`, `0044 ...`) sets the country; the 0 a national number starts with is left out (kept in Italy); the countries of the North American plan are told apart by area code; `countries` lists the ones the field takes (in that order, and one means nothing to choose) and `country` the one it starts with. The table shows `+44 207 183 8750` as a link that calls it. See [docs/reference/fields/phone.md](docs/reference/fields/phone.md) and the Formatted strings resource of the catalogue.
- **A money field,** `input: 'money'`: an amount and its currency, kept as `{ amount, currency }` (the amount in the major unit, with the decimals of the currency: 2 for dollars, none for yen, 3 for dinars). The currency is one the field fixes (`currency`) or a list to choose from (`currencies`, twelve common ones by default, named in the language of the admin); the amount is read as it is written (`19.99`, `19,99`, `1.234,56`), written with the decimals of the currency when the box is left and rounded to them; `min` and `max` are amounts and the message is written in the currency. The table shows `$19.99` in the language of the admin and sorts by the amount. See [docs/reference/fields/money.md](docs/reference/fields/money.md) and the Quantities resource of the catalogue.
- **A duration field,** `input: 'duration'`: a length of time typed in one box that keeps its template, `__:__` (`__:__:__` with seconds, `___d __h` with days, `___m` for a unit alone): the digits fill the slots from the left, a colon or a space ends a part (`1:` is `01:`), Backspace takes a digit away, and a length pasted as `1h 30m`, `1.5h`, `2d 3h`, `1小时30分` or a bare number fills them; when the box is left the lengths are carried up (`00:90` becomes `01:30`). The units are hours and minutes by default, or any of days, hours, minutes and seconds with `units`; `min` and `max` are in seconds and the message is written in the units of the field; the table shows `1h 30m` in the language of the admin. See [docs/reference/fields/duration.md](docs/reference/fields/duration.md).
- **A rating field,** `input: 'rating'`: a number of icons (star, heart, thumb, flame, bolt or circle, one to ten, in a colour of the theme) filled up to the value, chosen with a click or the arrow keys, with half steps when the field asks (`half`), and taken away by clicking the chosen icon again (`clearable`). It is a group of radio buttons a screen reader reads as "3 of 5"; the value is a number, absent without a rating; the table shows the icon and `4 / 5`. See [docs/reference/fields/rating.md](docs/reference/fields/rating.md).
- **An image map field,** `input: 'imagemap'`: an image field with areas laid over the picture, each with a title, a link and a target. A modal draws rectangles, circles and polygons with the pointer (or adds one with a button and places it with numbers and the arrow keys), moves and reshapes them, orders them (the first is on top, as in an HTML image map) and gives each a link: an address with a title and where it opens (`https://`, `mailto:`, `tel:`, a path), a record picked from one resource or from several (`references`, each with a `title`; where it opens only with `openIn`), or a value the person types (`links` chooses which are offered, `labels` changes the words). The map is kept with the picture as `imageMap` (coordinates as fractions of its size, so it is right at any size), checked before anything is written (shapes, coordinates in range, links never `javascript:` or `data:`), replaced as a whole by an update, and carried by sync, which turns a record id into the same record on the other CMS. See [docs/reference/fields/imagemap.md](docs/reference/fields/imagemap.md) and the Image maps resource of the catalogue.
- **A crop image field,** `input: 'cropimage'`: an image field with a crop tool in a modal. The picture is kept as it was uploaded, the crop is stored with it as a recipe and the API cuts the image when it is asked for (`GET .../attachments/:aid/cropped`, at any size with `?resize=`, cuts cached), so a crop can be changed at any time. The tool offers a free frame, the shape of the picture, the usual ratios (1:1, 4:3, 3:2, 16:9, 3:4, 2:3, 9:16), a ratio typed in or the ones the field lists (`aspectRatios`), a fixed ratio or size (`aspectRatio`, `width` and `height`), turning and flipping, zoom, the frame in pixels, a maximum size, the format and quality of the result, a rectangle or a circle (`shape`), and an **Auto** button that puts the frame where smart cropping would (`GET .../attachments/:aid/crop-suggestion`, and `POST /api/:resource/attachments/crop-suggestion` for a picture that is not saved yet). The field shows the cut, in its shape, and a click on the picture opens it. See [docs/reference/fields/cropimage.md](docs/reference/fields/cropimage.md) and the Crop images resource of the catalogue.
- **Sync of every resource at once.** The Sync page (CMS group) has **Push all** and **Pull all**, shows the resources chosen in the Sync settings, the run as it goes, the last run with what each resource created, updated and removed, and the schedule. The same run starts from code (`cms.$sync.run('articles', 'push')`, `cms.$sync.runAll('pull')`), from the `cms-sync push|pull` command (exit codes for scripts and CI), over HTTP (`POST /sync/run/push`, `GET /sync/runs`) or on a cron schedule (`sync.schedule` in `cms.json`, read in the server's time zone). See [docs/operations/SYNC.md](docs/operations/SYNC.md).
- **Resources to sync chosen in the admin.** The Sync settings offer the resources of the CMS in a drop-down (typed names are accepted); the `sync.resources` list of the configuration is only a fallback until some are chosen, and applies without a restart.
- **Sync of files and blocks.** The attachments of a record are synced file by file: a file that is the same (content and name) is left alone, the ones the source no longer has are removed, the missing ones copied with their type, order and payload; a file that cannot be copied makes the run an error, and every report, the page and the command count the attachments. The relations and files inside the blocks of a `paragraph` field are synced too, blocks inside blocks included, and a record id written in a text, a rich text or a JSON value is followed to the same record on the other CMS (`cms-ref://resource/value` in transit).
- **Resolving relations from code.** `cms.api()('comments', 'authors')` gives the records with the records their `select` and `multiselect` fields point to in place of the ids, in `list`, `find`, and what `create` and `update` answer; per language, inside paragraph blocks, one level into the related records when their resource is named too. An id no record has becomes `undefined` in its place.
- **Bulk writes from code.** `api('articles').bulk(async () => { ... })` runs many writes with one wait for the disk at the end instead of one per record. The sync and the import plugin use it.
- **Jump to menu on every record form.** It lists the fields, the blocks of a paragraph field and their fields, marks what changed, and lights up where it jumps to.
- **Layout examples** in the field catalogue: tiles in a grid, and fields on lines of a form.
- **Groups:** the Plugins field is a drop-down of the plugin pages; admins get Replicator only when replication runs.
- **A Today button on date fields,** next to the Now button of the fields with a time; it sets the start of the day, as picking the day in the calendar does.
- **Docs:** the Sync page screenshot and a walkthrough of a sync on one machine; resolving relations, `bulk` and the attachments of a sync in the API and Sync pages; this changelog.

### Changed

- **The crop of an image** (the `crop` option of an image field, set in the old crop tool) uses the new modal, and is cut by the same recipe: a crop that hangs over the picture is now cut to it instead of failing, and a picture turned by its EXIF orientation is cropped as it is shown.
- **Writes are much faster in a run.** Every write waited for the disk (4 ms each); inside `bulk`, in a sync and in an import they wait once at the end: 2000 creates take 0.3 s instead of 8 s, a sync of 2000 records 4.8 s instead of 13.6 s. The value of a unique field is checked against an index in memory instead of a scan of the resource (2000 creates with a unique field: 3.5 s to 0.3 s); the engines of this process feed the index with every write, replication included.
- **Sync compares in linear time:** the records of each side are found by their unique key instead of by searching the other side at every record.
- **Admin look:** a deeper indigo primary colour, drop-down menus edge to edge, a lock icon for read-only fields and no icon for disabled ones, the uploads panel as wide as the toasts.
- **A file dropped on a paragraph field** reaches the file field of its new block as data (the paragraph field queues it under the field's key, the field takes it when it mounts) instead of a search through the DOM, the labels and the private fields of the Vue instances with two fallbacks and a timer.
- **Admin code:** no `$forceUpdate` after a reactive change, the events of every component declared, step-by-step messages through `log.debug` (shown with `?debug`), `prefer-const` and `eqeqeq` enforced on the admin and the backend alike, shared helpers for the shortcut labels, the scroll checks and the text validation.
- **Backend code:** the driver context is a Node `EventEmitter` (the copy of Backbone.Events is gone), resized images are cached with `stream.pipeline`, the attachment-field patterns are built in the open and compiled once per request, the importers use the logger.
- **Every function of the backend and of the admin carries a doc comment** with the types of its parameters and of its answer, and a line about what the name does not say (a side effect, an edge case, a unit); route handlers and driver hooks say which moment they run at. Names that said the wrong thing are replaced: `getDateTomorrow` → `tokenExpiresAt`, `cleanRecord` → `removeDuplicateRecords`, `assignObjectsValue` → `copyFieldValues`, the `startsWith` wrapper of `isLocalId` → `isLocalRecord`, `injectDataToSyslogData` → `addLogOutput`, `getSyslogData` → `linesAfter`, `getTypePrexix` → `recordErrorMessage`, `renderBaseOnSearch` → `highlightSearch`, `interactiveSearch` → `focusSearch`, `checkIndex` → `rangeEnd`, `calculateLineNumberSpacing` → `lineNumberPrefix`. Two functions nothing called are gone (`getFirstKey` of the record list, the `startsWith` of the authentication plugin), and the two extension lists of the paragraph field come from one method.
- **Keyboard shortcuts are a directive of the admin** (`v-shortkey`, in `src/utils/shortkey.js`) instead of `vue3-shortkey`, whose npm release prints its debug output and which came as a tarball of a fork: nothing is fetched outside the npm registry, and npm 12 installs the package. The hand-written key handlers go through it too: Ctrl+K is the switcher's own, `/` and Ctrl+/ reach the search field of the list and the table, Ctrl+B and Escape move the sidebar. Ctrl+P, a second shortcut of the switcher that the library had added, is gone: the switcher is Ctrl+K.

### Fixed

- **Resolving relations never worked:** the hook was bound with `.bind` on an arrow function (a no-op), and the walk by regular expression looped on the records it had itself put in place.
- **A required file field refused the first file dropped on it:** the rules ran against the box's own value, which only knows the files picked in it; they run against the files that arrive.
- **A copied image kept no type:** a sync copied an image as `application/octet-stream`; it now goes through a file, as an upload does, and keeps `image/jpeg`.
- **The abnormal files of a record are pinned by tests:** a file uploaded without a language on a field that is now localised, with a language on a field that no longer is, or past a lowered `maxCount`, stays visible and flagged in the admin.
- A Vue 2 directive that could not run in Vue 3 (and was used nowhere) is gone; the leftovers of a `markets` resource in the sync are gone.
- Two tests that load the whole package wait as long as a slow disk needs (a WSL mount loads it in 25 s, a native disk in 1 s). The catalogue test reads the input types from `const typeMapper` (it looked for `let`, gone with `prefer-const`, and saw no type at all).
- **Dragging a saved image or file to another place is saved:** the editor only sent an attachment again when its name, position or crop had changed, never its order, so a reorder was lost at the next load. The order change counts as an update now (the server already took it).
- **Dragging blocks, images and files starts at once with a mouse:** the lists waited 150 ms after the press before a drag could begin, and any movement in that time cancelled it, so a quick press-and-move, which is how anyone drags, did nothing and the list looked broken. The wait is for touch only now (a swipe on the handle still scrolls). Checked in a real browser: the order is stored with the record after a drag and a save.
- **The upload area is a field like the others, and its drop look no longer stays.** At rest it has the surface, the border, the radius, the height and the hover, focus and error states of a text field, its hint at the left beside the icon; the dashed accent look is only for a file being dragged over it, and it comes from the file input itself, which knows when the file is dropped or gone (our own flag was never switched off after a drop, so the area stayed highlighted, and the dropped file stayed in the box and hid its hint). The same file can be chosen twice in a row.
- **The cards of images and files:** the grip at the left of the top row with the position as `1/3` (none for a single file, and then no row at all), the picture across the whole card (cropped to a fixed shape, centred), a bin in the corner of the picture, the name and the size at the foot with the name cut by an ellipsis and never pushing anything out of the card. A file with no picture has a View button and a Remove button side by side. A reorder moves the previews instead of giving each file to the preview that was in that place, so the pictures no longer blink. The blocks of a paragraph field are kept the same way: moving, dragging or removing a block no longer builds every other block again (their forms, their editors and their pictures stay, and so does what was typed and not saved).
- **A grip to drag, a lighter drag, and a Reorder mode for blocks, images and files.** Only a small grip icon starts a drag now (on the title bar of a block, beside the name of an image or file; not shown when there is a single one, or the field is locked: nothing to put in order), so a press anywhere else selects, scrolls or clicks as usual, and a finger no longer has to hold: the 150 ms wait is gone with it. The copy of a block that follows the pointer was a clone of the whole block, forms and editors included, repainted at every move; it is only its title bar now (about 23 nodes in place of several hundred). While a block is carried the others fold to their title bars, which brings every place within reach, and the page keeps the carried block under the pointer and where it is dropped. A **Reorder** button over the list switches blocks to one line each (with the start of their first text) and images and files to their pictures, with buttons to move each one place (↑ ↓, ← →), for keyboard, touch and long lists; a screen reader is told where a block went.
- **Dragging a block, an image or a file no longer selects text, shows a grab cursor, and leaves no duplicate ids:** the drag selected the text of the blocks it crossed (the page now stops selecting from the press on the handle until the drop); the handle of a block showed a pointer, it shows an open hand and a closed one while dragging; and the copy of the block that follows the pointer, a clone of its DOM, put every id of the block on the page twice until the drop (the browser listed "duplicate form field id"), it keeps none. The forms of two blocks no longer share ids either (`heading-0` was in every block).
- **The form fields of the admin pass the browser's checks:** the omnibar search has its label, a file field's label points at its input only when the input is there (not on a locked or full one), the JSON editor builds its ids from one root per field (two editors in a page shared `root-edit-json-textarea` and others), and the inputs the date, colour, code and file widgets make on their own get a name. Checked on every resource of the dev catalogue, list, record and new record, in a real browser: no input without an id or name, no label pointing at nothing, no `aria-labelledby` without its element, no duplicate id.
- **An image or a file can no longer be dragged into another field:** every image and file list shared one drag group (`description`, from the options shared by the lists, which came after the group each list names for itself), so a picture could be dropped into the field next to it. Each list is its own group now, as the lists of blocks already were.
- **The bar above a record grows when it wraps:** on a narrow screen the status chips and the buttons go to a second line, and the bar was squeezed back to one by the form below it, the second line overlapping the first field. It keeps its height now.
- **No empty `<label>` next to the text, tag, select, paragraph and transliterate fields:** they handed Vuetify an empty label slot, which rendered a label with nothing in it and nothing to point at (the browser listed one "no label associated with a form field" per field). The label before the field is now a real `<label>` pointing at its input, and carries the id Vuetify's `aria-labelledby` expects; the type chooser of a paragraph field has a hidden "Block type" label.
- **No 404 in the console at every admin load:** the admin asked `/replicator/resources` to learn whether replication runs (404 meant off). `/admin/config` now carries `disableReplication`, and the Replicator page is listed from it.
- Ctrl+/ reaches the search field from a keyboard where `/` needs Shift (a French one); Ctrl+A in a rich text or a drop-down selects in the field, not the records of a multiselect page.

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

[Unreleased]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.3...HEAD
[3.0.3]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/xiaodoudou/embed-cms/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/xiaodoudou/embed-cms/releases/tag/v3.0.0
