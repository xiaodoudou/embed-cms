← [embed-cms](../README.md)

# The embed-cms documentation

This is the map: GitHub shows it when you open the `docs/` folder, so it's the one page that lists all the others. Start with the page that matches what you're doing. Every topic has one page that owns it; the others link there rather than repeat it, so if two pages ever disagree, the owner is right (and the other one is a bug worth reporting). What changed in each version, and what is on `main` and not yet released: [CHANGELOG.md](../CHANGELOG.md).

## Start (`start/`)

1. [**README**](../README.md): what embed-cms is, and a running CMS with a first resource in five minutes.
2. [**Getting started**](start/GETTING_STARTED.md): embed-cms inside your own Express app, related resources, public reads, editor accounts, going to production, and the errors people hit most.
3. [**Concepts**](start/CONCEPTS.md): resource, field, locale, attachment, paragraph, users and groups, view, plugin. Read it when a word in the other pages is unfamiliar.

## Reference (`reference/`)

- [**Field types**](reference/FIELDS.md): the 24 input types, the options they share, localisation, and what is checked where. Each type has its own page in [`fields/`](reference/fields/), with every variation and a screenshot.
- [**Field catalogue**](../resources/README.md): the example resources in `resources/`, one per family of fields, ready to copy from.
- [**Form layout**](reference/FORM_LAYOUT.md): fields side by side on a line of the record form.
- [**Dynamic layout**](reference/DYNAMIC_LAYOUT.md): paragraph blocks side by side in the editor.
- [**Configuration**](reference/CONFIG.md): every option of `cms.json`, authentication, logs, storage engines.
- [**API**](reference/API.md): the REST routes, querying and paging, attachments and image resizing, the JavaScript API and hooks.
- [**RestHelper**](reference/REST_HELPER.md): the REST middlewares in your own Express routes.
- [**ContentLoader**](operations/CONTENT_LOADER.md): content and files from a JSON file (`authors://mei-lin` for a relation, `attachment://files/cover.jpg` for a file), checked before it is written and safe to run again; `cms-load` is its command.
- [**PageHelper**](reference/PAGE_HELPER.md): the pages of your public site, rendered from the content with Mustache templates and kept until a template or a record changes.
- [**Smart cropping**](reference/SMART_CROPPING.md): resizes that keep the interesting part of a picture, not its centre.
- [**Types and editor support**](reference/TYPESCRIPT.md): the type definitions that ship with embed-cms: typed options, hooks, plugins, resource declarations and the admin's globals, with autocomplete in your editor.

## Examples (`examples/`)

- [**Blog**](examples/site/README.md): a tutorial in one folder: the shortest site on embed-cms, with the [PageHelper](reference/PAGE_HELPER.md). A resource, the CMS and the pages in one Express application, the first content from a JSON file, Mustache templates, a 404 and an error page. Runnable.
- [**Magazine**](examples/magazine/README.md): a tutorial on a bilingual site built with no helper: Express, `cms.api()`, relations, pictures, a search, a feed, a sitemap and a template engine of its own. Runnable.
- [**Docs platform**](examples/platform/README.md): an advanced tutorial on a platform that hosts the docs of several products, a version at a time, whose CMS is not on the public site: pages and products for members, files that follow the page, a sign-in of its own with passwords nobody can read back, and a support form. Runnable.

The three share an [overview](examples/README.md): what they have in common and the few ideas a project needs.

## Operations (`operations/`)

- [**Storage engines**](operations/STORAGE.md): LevelDB, SQLite, JSON file, MongoDB or PostgreSQL: which to pick, real benchmarks through the whole CMS, what a crash loses, how to switch.
- [**Security**](../SECURITY.md): the security settings, the recommended production configuration, the hardening checklist, and how to report a vulnerability.
- [**Replication**](operations/REPLICATION.md): keeping several servers in step, continuously.
- [**Sync**](operations/SYNC.md): copying chosen resources between two servers, such as staging and production, on demand from the admin, from code or the `cms-sync` command, or on a schedule.
- [**Import and export**](operations/IMPORT.md): Google Sheets, Excel files, and copying from another embed-cms.

## Extending the admin (`extending/`)

- [**Writing a plugin**](extending/PLUGINS.md): your own server plugin (routes, a resource, hooks) and your own admin page, with a small working example of each, and the host object a page uses.
- [**Plugin UI kit**](extending/PLUGIN_UI_KIT.md): the CSS-only kit for plugins (links, layout, boxes, tables, forms, buttons) that sits beside Vuetify and reads the same tokens.
- [**Plugin system design**](extending/PLUGIN_SYSTEM_DESIGN.md): the design of the admin plugin system: the public tokens, the kit and the host object (built), then run-time loading, layouts, widgets and custom field types.
- [**Design system**](extending/DESIGN_SYSTEM.md): the palette, the shared components and the design rules a test enforces.

## Working on embed-cms (`contributing/`)

- [**Contributing**](../CONTRIBUTING.md): setting up, running the app while you work, tests, CI, commit messages.
- [**Architecture**](contributing/ARCHITECTURE.md): one request followed from the admin to the store and back.
- [**Testing**](contributing/TESTING.md): how the test suites are built, the helpers, the driver contract suite, the benchmark.

## Who owns what

Each topic is written once, on the page that owns it.

| If you want to know | Read |
|---|---|
| What a word means: resource, field, locale, paragraph, view | [CONCEPTS.md](start/CONCEPTS.md) |
| Putting the CMS in your own Express app | [GETTING_STARTED.md](start/GETTING_STARTED.md) |
| Every option of `cms.json` (except security) | [CONFIG.md](reference/CONFIG.md) |
| The security options and the production configuration | [SECURITY.md](../SECURITY.md) |
| What an input type is and each of its options | [FIELDS.md](reference/FIELDS.md) and [`fields/`](reference/fields/) |
| Fields side by side in a form, blocks side by side | [FORM_LAYOUT.md](reference/FORM_LAYOUT.md), [DYNAMIC_LAYOUT.md](reference/DYNAMIC_LAYOUT.md) |
| The REST routes, the record shape, the JavaScript API, hooks | [API.md](reference/API.md) |
| The REST middlewares in your own routes | [REST_HELPER.md](reference/REST_HELPER.md) |
| The pages of a public site, rendered and kept | [PAGE_HELPER.md](reference/PAGE_HELPER.md) |
| Content and files loaded from a JSON file, `cms-load` | [CONTENT_LOADER.md](operations/CONTENT_LOADER.md) |
| Resizing and smart cropping of images | [API.md](reference/API.md#attachments), [SMART_CROPPING.md](reference/SMART_CROPPING.md) |
| Type definitions and editor autocomplete | [TYPESCRIPT.md](reference/TYPESCRIPT.md) |
| Where records are stored, engine speed and safety | [STORAGE.md](operations/STORAGE.md) |
| Replication, sync between servers, importers | [REPLICATION.md](operations/REPLICATION.md), [SYNC.md](operations/SYNC.md), [IMPORT.md](operations/IMPORT.md) |
| How to build a whole site, step by step | the three tutorials: [blog](examples/site/README.md), [magazine](examples/magazine/README.md), [docs platform](examples/platform/README.md) |
| Your own plugin or admin page | [PLUGINS.md](extending/PLUGINS.md), [PLUGIN_UI_KIT.md](extending/PLUGIN_UI_KIT.md) |
| Design tokens and UI rules of the admin | [DESIGN_SYSTEM.md](extending/DESIGN_SYSTEM.md) |
| How the code fits together | [ARCHITECTURE.md](contributing/ARCHITECTURE.md) |
| The commands for tests and CI, branches and releases | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| How the tests are built | [TESTING.md](contributing/TESTING.md) |
| What changed in each version | [CHANGELOG.md](../CHANGELOG.md) |
