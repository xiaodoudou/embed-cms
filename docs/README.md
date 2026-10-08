← [embed-cms](../README.md)

# The embed-cms documentation

This is the map of the documentation. GitHub shows it when you open the `docs/` folder. Start with the page that matches what you are doing.

Each topic has one page that owns it. The other pages link to it instead of repeating it. If two pages disagree, the owner is right, and the other page has a bug worth reporting.

For what changed in each version, and what is on `main` but not released yet, see [CHANGELOG.md](../CHANGELOG.md).

## Start (`start/`)

1. [README](../README.md): what embed-cms is, and a running CMS with a first resource in five minutes.
2. [Getting started](start/GETTING_STARTED.md): embed-cms inside your own Express app, related resources, public reads, editor accounts, going to production, and the errors people hit most.
3. [Concepts](start/CONCEPTS.md): resource, field, locale, attachment, paragraph, users and groups, view, plugin. Read it when a word in the other pages is unfamiliar.

## Reference (`reference/`)

- [Field types](reference/FIELDS.md): the 24 input types, the options they share, localisation, and what is checked where. Each type has its own page in [`fields/`](reference/fields/), with every variation and a screenshot.
- [Field catalogue](../resources/README.md): the example resources in `resources/`, one per family of fields, ready to copy from.
- [Form layout](reference/FORM_LAYOUT.md): fields side by side on a line of the record form.
- [Dynamic layout](reference/DYNAMIC_LAYOUT.md): paragraph blocks side by side in the editor.
- [Configuration](reference/CONFIG.md): every option of `cms.json`, authentication, logs and storage engines.
- [API](reference/API.md): the REST routes, querying and paging, attachments and image resizing, the JavaScript API and hooks.
- [RestHelper](reference/REST_HELPER.md): the REST middlewares in your own Express routes.
- [ContentLoader](operations/CONTENT_LOADER.md): content and files from a JSON file. `cms-load` is its command.
- [PageHelper](reference/PAGE_HELPER.md): the pages of your public site, rendered from the content with Mustache templates and kept until a template or a record changes.
- [Smart cropping](reference/SMART_CROPPING.md): resizes that keep the interesting part of a picture, not its centre.
- [Types and editor support](reference/TYPESCRIPT.md): the type definitions that ship with embed-cms, and autocomplete in your editor.

## Examples (`examples/`)

- [Blog](examples/site/README.md): the shortest site on embed-cms, built with the [PageHelper](reference/PAGE_HELPER.md). Runnable.
- [Magazine](examples/magazine/README.md): a bilingual site built with no helper: Express, `cms.api()`, relations, pictures, a search, a feed and a sitemap. Runnable.
- [Docs platform](examples/platform/README.md): an advanced tutorial on a platform that hosts the docs of several products, whose CMS is not on the public site. It has pages for members and a sign-in of its own. Runnable.
- [Boardwalk](examples/taskboard/README.md): a Vue 3 task board over the REST API, with a login the app never sees, drag and drop, and real time over the websocket. Runnable.
- [Docker](examples/docker/README.md): how to run embed-cms in a container with every secret in a `.env`. Runnable.

The sites and the app share an [overview](examples/README.md): what they have in common, and the few ideas a project needs.

## Operations (`operations/`)

- [Storage engines](operations/STORAGE.md): LevelDB, SQLite, JSON file, MongoDB or PostgreSQL. Which to pick, real benchmarks through the whole CMS, what a crash loses, and how to switch.
- [Security](../SECURITY.md): the security settings, the recommended production configuration, the hardening checklist, and how to report a vulnerability.
- [Replication](operations/REPLICATION.md): keeping several servers in step, continuously.
- [Sync](operations/SYNC.md): copying chosen resources between two servers, such as staging and production, from the admin, from code, with the `cms-sync` command, or on a schedule.
- [Import and export](operations/IMPORT.md): Google Sheets, Excel files, and copying from another embed-cms.
- [Backup and restore](operations/BACKUP.md): `cms-backup` and `cms-restore`, from the data folder (every `_id` kept) or over the REST API (a payload `cms-load` replays, with new `_id`).

## Extending the admin (`extending/`)

- [Writing a plugin](extending/PLUGINS.md): your own server plugin (routes, a resource, hooks) and your own admin page, with a small working example of each, and the host object a page uses.
- [Plugin UI kit](extending/PLUGIN_UI_KIT.md): the CSS-only kit for plugins (links, layout, boxes, tables, forms, buttons). It sits beside Vuetify and reads the same tokens.
- [Plugin system design](extending/PLUGIN_SYSTEM_DESIGN.md): the design of the admin plugin system. The public tokens, the kit and the host object are built. Run-time loading, layouts, widgets and custom field types are planned.
- [Design system](extending/DESIGN_SYSTEM.md): the palette, the shared components and the design rules a test enforces.

## Working on embed-cms (`contributing/`)

- [Contributing](../CONTRIBUTING.md): setting up, running the app while you work, tests, CI and commit messages.
- [Architecture](contributing/ARCHITECTURE.md): one request followed from the admin to the store and back.
- [Testing](contributing/TESTING.md): how the test suites are built, the helpers, the driver contract suite and the benchmark.

## Agent skills (`../skills/`)

- [Skills](../skills/README.md): eight skills for coding agents (Claude Code, Codex, Gemini CLI, Cursor, Copilot and others) that create a site, model and load content, patch records, back up, sync and go to production on embed-cms. The `cms-skills` command installs them.

## Who owns what

| If you want to know | Read |
|---|---|
| What a word means: resource, field, locale, paragraph, view | [CONCEPTS.md](start/CONCEPTS.md) |
| How to put the CMS in your own Express app | [GETTING_STARTED.md](start/GETTING_STARTED.md) |
| Every option of `cms.json` (except security) | [CONFIG.md](reference/CONFIG.md) |
| The security options and the production configuration | [SECURITY.md](../SECURITY.md) |
| How to run it in a container, with the secrets in a `.env` | [the Docker example](examples/docker/README.md) |
| What an input type is, and each of its options | [FIELDS.md](reference/FIELDS.md) and [`fields/`](reference/fields/) |
| Fields side by side in a form, blocks side by side | [FORM_LAYOUT.md](reference/FORM_LAYOUT.md), [DYNAMIC_LAYOUT.md](reference/DYNAMIC_LAYOUT.md) |
| The REST routes, the record shape, the JavaScript API, hooks | [API.md](reference/API.md) |
| The REST middlewares in your own routes | [REST_HELPER.md](reference/REST_HELPER.md) |
| The pages of a public site, rendered and kept | [PAGE_HELPER.md](reference/PAGE_HELPER.md) |
| Content and files loaded from a JSON file, `cms-load` | [CONTENT_LOADER.md](operations/CONTENT_LOADER.md) |
| Resizing and smart cropping of images | [API.md](reference/API.md#attachments), [SMART_CROPPING.md](reference/SMART_CROPPING.md) |
| Type definitions and editor autocomplete | [TYPESCRIPT.md](reference/TYPESCRIPT.md) |
| Where records are stored, engine speed and safety | [STORAGE.md](operations/STORAGE.md) |
| Backing up and restoring a site, `cms-backup`, `cms-restore` | [BACKUP.md](operations/BACKUP.md) |
| Replication, sync between servers, importers | [REPLICATION.md](operations/REPLICATION.md), [SYNC.md](operations/SYNC.md), [IMPORT.md](operations/IMPORT.md) |
| How to build a whole site, step by step | The tutorials: [blog](examples/site/README.md), [magazine](examples/magazine/README.md), [docs platform](examples/platform/README.md). For an app that uses the REST API from a browser, see [Boardwalk](examples/taskboard/README.md). |
| Your own plugin or admin page | [PLUGINS.md](extending/PLUGINS.md), [PLUGIN_UI_KIT.md](extending/PLUGIN_UI_KIT.md) |
| Design tokens and UI rules of the admin | [DESIGN_SYSTEM.md](extending/DESIGN_SYSTEM.md) |
| How the code fits together | [ARCHITECTURE.md](contributing/ARCHITECTURE.md) |
| The commands for tests and CI, branches and releases | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| How the tests are built | [TESTING.md](contributing/TESTING.md) |
| What changed in each version | [CHANGELOG.md](../CHANGELOG.md) |
