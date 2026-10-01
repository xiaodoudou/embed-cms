# Contributing

Thanks for helping. This page gets you from a clone to a change that passes CI: setting up, running the app while you
work on it, the tests, and how commits are written here. For how the code fits together, read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first; it's short.

## Setting up

You need Node.js 22.12 or later (CI runs Node 22) and git.

```sh
git clone https://github.com/xiaodoudou/embed-cms.git embed-cms
cd embed-cms
npm ci
```

`npm ci` installs `sharp`, the image library, which downloads a prebuilt binary for your platform; there is nothing
else to compile.

The first `npm ci` also builds the admin app into `dist/` (`scripts/prepare.js`, the `prepare` script, which builds only
when `dist/` is missing); set `EMBED_CMS_SKIP_BUILD=1` to skip it. `npm pack` always rebuilds it first (`prepack`), and the
`files` list of `package.json` decides what the package contains: add a new top-level file there if the CMS needs it at
run time.

## Running it

There are two ways, depending on what you work on.

**Backend, or a quick look.** Start the server (run `npm run build` after changing `src/`):

```sh
node server.js            # http://localhost:9990/admin, localAdmin / localAdmin
```

To see what the admin bundle is made of, build with `ANALYZE=1 npm run build`: it also writes `stats.html`, a map of the chunks
(git-ignored).

**The admin app, with hot reload.** Run the backend and Vite side by side, in two terminals:

```sh
npm run serve-backend     # the server on 9990, serving src/ instead of dist/, with --inspect for a debugger
npm run dev               # Vite on 19990, proxying /admin, /api and the plugin routes to 9990
```

Open <http://localhost:19990/admin/>. Opening port 9990 in this mode gives a blank page, because nothing there compiles
`src/`. The VS Code workspace has a launch configuration that attaches to the backend.

`server.js` (the `cms` command) is a development harness when it runs in this folder: it turns on the sync plugin and
turns off replication (`lib/cliOptions.js`). Run anywhere else, it starts a plain CMS from that folder's `cms.json`.
`PORT` changes its port. The resources in
`resources/` are the field catalogue, one resource per family of field types, which is also what the field documentation's
screenshots show.

`npm run serve-prod` runs the built app with `NODE_ENV=production`, so it refuses to
start with the default secrets and doesn't create `localAdmin`. That's on purpose; see [SECURITY.md](SECURITY.md).

## Tests

| Command | What it runs |
|---|---|
| `npm run test:unit` | Backend unit and security tests (mocha, `test/unit`, `test/security`). Each test boots its own CMS on a random port. |
| `npm run test:frontend` | Frontend tests (vitest and jsdom, `test/frontend`), including components mounted with Vuetify. Same as `npx vitest run`. |
| `npm test` | The older HTTP integration suite. Set `TEST_PORT` if 9990 is taken. |
| `npm run test:all` | All three. |
| `npm run test:coverage` | The unit tests with a coverage summary. |
| `npx mocha test/unit/drivers.contract.test.js` | The same suite against the JSON store, PostgreSQL and MongoDB (the last two are skipped without a server). |

[docs/TESTING.md](docs/TESTING.md) explains how the tests are built, the helpers, the driver contract suite, the
benchmark, and what to do about random `ETIMEDOUT` failures on some machines.

A few tests guard the documentation:

- `test/frontend/fieldDocs.test.js`: every field type in `FormService.typeMapper` has a page in `docs/fields/`, linked
  from `docs/FIELDS.md`, and every screenshot a page links to exists.
- `test/unit/securityConfig.unit.test.js`: the recommended configuration in `SECURITY.md` only uses real options and
  boots.
- `test/frontend/brand.test.js`: no text file mentions the project's former owner.
- `test/frontend/designSystem.test.js`: the design rules of [docs/UI_REDESIGN.md](docs/UI_REDESIGN.md) hold (no colour
  literals in components, every token defined in both themes).

## What CI checks

`.github/workflows/test.yml` runs on every pull request and on `master`:

1. `npx eslint lib src index.js test/unit test/security test/helpers test/bench` (no `--fix`: run `npm run lint` locally
   to fix what can be fixed);
2. `npm run test:unit`, `npm run test:frontend`, `npm test`;
3. `npm run build`;
4. `npm audit --omit=dev --audit-level=high`;
5. in a second job, the driver contract suite against PostgreSQL 16 and MongoDB 7 service containers.

Run the first three locally before you push. `npm run knip` finds unused files, exports and dependencies.

## Making a change

- **One concern per commit**, small enough to review. A refactor and a behaviour change are two commits.
- **A bug fix comes with a test** that fails without the fix.
- **Protections are on by default.** A protection becomes a `security.*` setting that defaults to on
  (`lib/util/securityOptions.js`), so a deployment can turn one off for a reason but never gets one silently missing. It
  is documented in `SECURITY.md`.
- **UI code follows the design system**: colours, sizes and spacing come from `src/styles/tokens.css`; texts go through
  the translation files in `i18n/`, in English and Chinese.
- **Update the documentation in the same change.** A new option goes into [docs/CONFIG.md](docs/CONFIG.md), a new field
  option into its page in `docs/fields/`, a new route into [docs/API.md](docs/API.md). [docs/README.md](docs/README.md)
  says which page owns which topic.
- **Draw diagrams with [Mermaid](https://mermaid.js.org/)** in a ` ```mermaid ` block (GitHub renders it), not as
  ASCII art or images, so they stay editable in a diff. Check a new one with
  `npx -y @mermaid-js/mermaid-cli -i diagram.mmd -o diagram.svg`. Folder trees can stay plain text.

## Commit messages

The subject is a plain sentence saying what changes for the user of the code, in the present tense, without a type prefix
or a final period. Name the area first when it helps:

```
Uploads without a file extension keep their type
CI: actions/checkout and actions/setup-node v7
Saving is refused while a required field is empty, whatever its type
```

The body, wrapped at about 120 characters, explains **why**: what was wrong, what the change does about it, and anything
a reviewer should know (what was tried and dropped, what is left for later). The diff already says what changed line by
line.

## Pull requests

Open them against `master`. Describe the problem, the change, and how you checked it; screenshots for UI changes, in
both themes when colours are involved. CI must be green before review.

Security problems don't go in a public issue or pull request: see [SECURITY.md](SECURITY.md#reporting-a-vulnerability).
