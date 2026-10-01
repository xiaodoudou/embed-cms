# The embed-cms documentation

Start with the page that matches what you're doing. Every topic has one page that owns it; the others link there
rather than repeat it, so if two pages ever disagree, the owner is right (and the other one is a bug worth reporting).

## New to embed-cms

1. [**README**](../README.md): what embed-cms is, and a running CMS with a first resource in five minutes.
2. [**Getting started**](GETTING_STARTED.md): embed-cms inside your own Express app, related resources, public reads,
   editor accounts, going to production, and the errors people hit most.
3. [**Concepts**](CONCEPTS.md): resource, field, locale, attachment, paragraph, users and groups, view, plugin. Read it
   when a word in the other pages is unfamiliar.

## Describing content

- [**Field types**](FIELDS.md): the 24 input types, the options they share, localisation, and what is checked where.
  Each type has its own page in [`fields/`](fields/), with every variation and a screenshot.
- [**Field catalogue**](../resources/README.md): the example resources in `resources/`, one per family of fields, ready
  to copy from.
- [**Dynamic layout**](DYNAMIC_LAYOUT.md): paragraph blocks side by side in the editor.

## Reading and writing content

- [**API**](API.md): the REST routes, querying and paging, attachments and image resizing, the JavaScript API and hooks.
- [**RestHelper**](REST_HELPER.md): the REST middlewares in your own Express routes.
- [**Smart cropping**](SMART_CROPPING.md): resizes that keep the interesting part of a picture, not its centre.

## Running it

- [**Configuration**](CONFIG.md): every option of `cms.json`, authentication, logs, storage engines.
- [**Storage engines**](STORAGE.md): JSON file, SQLite, LevelDB, MongoDB or PostgreSQL: how they compare, what a crash loses, how to switch.
- [**Security**](../SECURITY.md): the security settings, the recommended production configuration, the hardening
  checklist, and how to report a vulnerability.
- [**Replication**](REPLICATION.md): keeping several servers in step, continuously.
- [**Sync**](SYNC.md): copying chosen resources between two servers, such as staging and production.
- [**Import and export**](IMPORT.md): Google Sheets, Excel files, and copying from another embed-cms.

## Working on embed-cms

- [**Contributing**](../CONTRIBUTING.md): setting up, running the app while you work, tests, CI, commit messages.
- [**Architecture**](ARCHITECTURE.md): one request followed from the admin to the store and back.
- [**Testing**](TESTING.md): how the test suites are built, the helpers, the driver contract suite, the benchmark.
- [**Admin UI design**](UI_REDESIGN.md): the palette, the shared components and the design rules a test enforces.

## Who owns what

| Topic | Owner |
|---|---|
| Options of `cms.json` (except security) | [CONFIG.md](CONFIG.md) |
| Security options, production configuration | [SECURITY.md](../SECURITY.md) |
| Field types and their options | [FIELDS.md](FIELDS.md) and [`fields/`](fields/) |
| Routes, record shape, JavaScript methods, hooks | [API.md](API.md) |
| Words and ideas | [CONCEPTS.md](CONCEPTS.md) |
| How the code fits together | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Test commands and CI | [CONTRIBUTING.md](../CONTRIBUTING.md) (commands), [TESTING.md](TESTING.md) (how the tests work) |
| Design tokens and UI rules | [UI_REDESIGN.md](UI_REDESIGN.md) |
| A plugin's own options | its page: [REPLICATION.md](REPLICATION.md), [SYNC.md](SYNC.md), [IMPORT.md](IMPORT.md) |

`resourceExamples/` holds older sample resources. They are not maintained and some use options that no longer exist (a
`select` with `options.resource` instead of `source`, table `options` nothing reads): prefer the catalogue in
`resources/`.
