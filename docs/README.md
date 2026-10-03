← [embed-cms](../README.md)

# The embed-cms documentation

This is the map: GitHub shows it when you open the `docs/` folder, so it's the one page that lists all the others. Start with the page that matches what you're doing. Every topic has one page that owns it; the others link there rather than repeat it, so if two pages ever disagree, the owner is right (and the other one is a bug worth reporting).

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
- [**Smart cropping**](reference/SMART_CROPPING.md): resizes that keep the interesting part of a picture, not its centre.
- [**Types and editor support**](reference/TYPESCRIPT.md): the type definitions that ship with embed-cms: typed options, hooks, plugins, resource declarations and the admin's globals, with autocomplete in your editor.

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

| Topic | Owner |
|---|---|
| Options of `cms.json` (except security) | [CONFIG.md](reference/CONFIG.md) |
| Security options, production configuration | [SECURITY.md](../SECURITY.md) |
| Where records are stored, engine speed and safety | [STORAGE.md](operations/STORAGE.md) |
| Type definitions, autocomplete | [TYPESCRIPT.md](reference/TYPESCRIPT.md) |
| Field types and their options | [FIELDS.md](reference/FIELDS.md) and [`fields/`](reference/fields/) |
| Routes, record shape, JavaScript methods, hooks | [API.md](reference/API.md) |
| Words and ideas | [CONCEPTS.md](start/CONCEPTS.md) |
| How the code fits together | [ARCHITECTURE.md](contributing/ARCHITECTURE.md) |
| Test commands and CI | [CONTRIBUTING.md](../CONTRIBUTING.md) (commands), [TESTING.md](contributing/TESTING.md) (how the tests work) |
| Design tokens and UI rules | [DESIGN_SYSTEM.md](extending/DESIGN_SYSTEM.md) |
| A plugin's own options | its page: [REPLICATION.md](operations/REPLICATION.md), [SYNC.md](operations/SYNC.md), [IMPORT.md](operations/IMPORT.md) |

`examples/` holds the sample configuration files of the importers (`cms-import-remote`, see [IMPORT.md](operations/IMPORT.md)).

