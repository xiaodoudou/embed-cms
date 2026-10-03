# Changelog

What changed in each version of Embed CMS, from 3.0.0 on, newest first. The versions follow [semantic versioning](https://semver.org); the headings follow [Keep a Changelog](https://keepachangelog.com). The **Unreleased** section gathers what is on `main` and not yet published to npm.

## [Unreleased]

### Added

- **Sync of every resource at once.** The Sync page (CMS group) has **Push all** and **Pull all**, shows the resources chosen in the Sync settings, the run as it goes, the last run with what each resource created, updated and removed, and the schedule. The same run starts from code (`cms.$sync.run('articles', 'push')`, `cms.$sync.runAll('pull')`), from the `cms-sync push|pull` command (exit codes for scripts and CI), over HTTP (`POST /sync/run/push`, `GET /sync/runs`) or on a cron schedule (`sync.schedule` in `cms.json`, read in the server's time zone). See [docs/operations/SYNC.md](docs/operations/SYNC.md).
- **Resources to sync chosen in the admin.** The Sync settings offer the resources of the CMS in a drop-down (typed names are accepted); the `sync.resources` list of the configuration is only a fallback until some are chosen, and applies without a restart.
- **Sync of files and blocks.** The attachments of a record are synced file by file: a file that is the same (content and name) is left alone, the ones the source no longer has are removed, the missing ones copied with their type, order and payload; a file that cannot be copied makes the run an error, and every report, the page and the command count the attachments. The relations and files inside the blocks of a `paragraph` field are synced too, blocks inside blocks included, and a record id written in a text, a rich text or a JSON value is followed to the same record on the other CMS (`cms-ref://resource/value` in transit).
- **Resolving relations from code.** `cms.api()('comments', 'authors')` gives the records with the records their `select` and `multiselect` fields point to in place of the ids, in `list`, `find`, and what `create` and `update` answer; per language, inside paragraph blocks, one level into the related records when their resource is named too. An id no record has becomes `undefined` in its place.
- **Bulk writes from code.** `api('articles').bulk(async () => { ... })` runs many writes with one wait for the disk at the end instead of one per record. The sync and the import plugin use it.
- **Jump to menu on every record form.** It lists the fields, the blocks of a paragraph field and their fields, marks what changed, and lights up where it jumps to.
- **Layout examples** in the field catalogue: tiles in a grid, and fields on lines of a form.
- **Groups:** the Plugins field is a drop-down of the plugin pages; admins get Replicator only when replication runs.
- **Docs:** the Sync page screenshot and a walkthrough of a sync on one machine; resolving relations, `bulk` and the attachments of a sync in the API and Sync pages; this changelog.

### Changed

- **Writes are much faster in a run.** Every write waited for the disk (4 ms each); inside `bulk`, in a sync and in an import they wait once at the end: 2000 creates take 0.3 s instead of 8 s, a sync of 2000 records 4.8 s instead of 13.6 s. The value of a unique field is checked against an index in memory instead of a scan of the resource (2000 creates with a unique field: 3.5 s to 0.3 s); the engines of this process feed the index with every write, replication included.
- **Sync compares in linear time:** the records of each side are found by their unique key instead of by searching the other side at every record.
- **Admin look:** a deeper indigo primary colour, drop-down menus edge to edge, a lock icon for read-only fields and no icon for disabled ones, the uploads panel as wide as the toasts.
- **A file dropped on a paragraph field** reaches the file field of its new block as data (the paragraph field queues it under the field's key, the field takes it when it mounts) instead of a search through the DOM, the labels and the private fields of the Vue instances with two fallbacks and a timer.
- **Admin code:** no `$forceUpdate` after a reactive change, the events of every component declared, step-by-step messages through `log.debug` (shown with `?debug`), `prefer-const` and `eqeqeq` enforced on the admin and the backend alike, shared helpers for the shortcut labels, the scroll checks and the text validation.
- **Backend code:** the driver context is a Node `EventEmitter` (the copy of Backbone.Events is gone), resized images are cached with `stream.pipeline`, the attachment-field patterns are built in the open and compiled once per request, the importers use the logger.
- **Keyboard shortcuts are a directive of the admin** (`v-shortkey`, in `src/utils/shortkey.js`) instead of `vue3-shortkey`, whose npm release prints its debug output and which came as a tarball of a fork: nothing is fetched outside the npm registry, and npm 12 installs the package. The hand-written key handlers go through it too: Ctrl+K is the switcher's own, `/` and Ctrl+/ reach the search field of the list and the table, Ctrl+B and Escape move the sidebar. Ctrl+P, a second shortcut of the switcher that the library had added, is gone: the switcher is Ctrl+K.

### Fixed

- **Resolving relations never worked:** the hook was bound with `.bind` on an arrow function (a no-op), and the walk by regular expression looped on the records it had itself put in place.
- **A required file field refused the first file dropped on it:** the rules ran against the box's own value, which only knows the files picked in it; they run against the files that arrive.
- **A copied image kept no type:** a sync copied an image as `application/octet-stream`; it now goes through a file, as an upload does, and keeps `image/jpeg`.
- **The abnormal files of a record are pinned by tests:** a file uploaded without a language on a field that is now localised, with a language on a field that no longer is, or past a lowered `maxCount`, stays visible and flagged in the admin.
- A Vue 2 directive that could not run in Vue 3 (and was used nowhere) is gone; the leftovers of a `markets` resource in the sync are gone.
- Two tests that load the whole package wait as long as a slow disk needs (a WSL mount loads it in 25 s, a native disk in 1 s).
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
