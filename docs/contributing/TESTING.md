← [Documentation](../README.md)

# Testing

There are three test suites, a database contract suite, and a few benchmarks. Everything but the benchmarks runs in CI (`.github/workflows/test.yml`).

| Command | What it runs | Notes |
|---|---|---|
| `npm run test:unit` | `test/unit` and `test/security` (mocha) | In-process, no fixed ports, no shared state |
| `npm run test:frontend` | `test/frontend` (vitest + jsdom) | Pure logic (validators, table model, dirty tracker, services) and real components mounted with Vuetify |
| `npm test` | `test/integration/runTests.js` (legacy HTTP integration suite) | Starts a server; set `TEST_PORT` to avoid clashes (default 9990) |
| `npm run test:coverage` | the unit suite under `c8` | Prints a coverage summary for `lib/` and `index.js` |
| `npm run test:all` | all of the above | |
| `npm run bench:engines` | The whole CMS on each storage engine, through REST | Not part of CI, see [Benchmarks](#benchmarks) |
| `node --expose-gc test/bench/bench.js` | The backend benchmark | Not part of CI, see [Benchmarks](#benchmarks) |

## How the backend tests are built

`test/helpers/app.js` exports `startApp(overrides)`. It boots a complete CMS in the current process:

- on a random port, so tests never collide;
- with its own temporary data directory **and its own `cms.json`**, so options never leak from one test to the next;
- with replication peers disabled.

It returns `{ cms, server, url, dataDir, close }`. Always `await app.close()` in `after`.

```js
const { startApp, ADMIN } = require('../helpers/app')

let app
before(async () => { app = await startApp({ xlsx: true }) })
after(async () => { await app.close() })

it('lists articles', async () => {
  const res = await request(app.url).get('/api/articles').auth(...ADMIN)
  expect(res.status).to.equal(200)
})
```

`startApp(overrides, { dataDir, keepData, beforeMount })` can boot a second time on the same data (`keepData` keeps the folder when the first app closes), and can hand the host express app to `beforeMount` before the CMS is mounted. Other helpers: `hardened(overrides)` (a production like app: fresh random secrets, the strict secret policy and no built-in `localAdmin`), `randomSecret()`, `createUser(app)` and `withNodeEnv(value, fn)`. Secrets in tests are always generated, never literals.

The shared test options (`test/helpers/cmsInstance.js`) turn on both login modes (`disableJwtLogin: false`, `disableAuthentication: false`), unlike the defaults of a real install. Tests must pick the right one:

- default (`disableAuthentication: false`): REST accepts HTTP Basic credentials, and the protected admin routes (`/admin/resources`, `/import`, `/replicator`, ...) accept a login **session** (`request.agent(...).post('/admin/login')`);
- JWT mode (pass `disableAuthentication: true`; `disableJwtLogin` is already `false`): cookies are parsed and the JWT cookie authenticates every route.

Every protection is on by default (see `SECURITY.md`). Tests run with the development defaults (`localAdmin` and the default secrets allowed) unless they call `hardened()`; a security regression test normally runs on both.

## Quiet logs

The CMS logs every refused request, failed login and boot warning, and the tests provoke all of them on purpose, so `.mocharc.cjs` loads `test/helpers/quiet.js`, which sets the log level to `silent`. A run prints test results, not stack traces. When a test fails and you want the CMS's side of the story, run it with the logs back on:

```bash
TEST_LOGS=1 npx mocha test/unit/rest.errors.test.js
```

Setting `LOG_LEVEL` does the same (`LOG_LEVEL=debug` shows even the refused requests, which are logged at debug level). A test that checks what is logged patches `logger.warn` and friends itself (see `test/unit/logging.refused.test.js`), so it does not depend on the level.

## Layout

| Path | Covers |
|---|---|
| `test/unit/` | The backend, one `<subject>.test.js` per module or plugin (mocha, in-process) |
| `test/security/` | One `<area>.security.test.js` per finding of the security audit (mocha, in-process) |
| `test/frontend/` | The admin app (vitest and jsdom): `<subject>.test.js` for pure logic, `<component>.component.test.js` for mounted components, `helpers/` for the mount helpers and the setup file. A test that fails is run again, twice, before it counts as failed (`retry` in `vitest.config.mjs`): a few tests of overlays and focus depend on how soon jsdom gets to a timer, and on a machine with many busy cores one of them fails about one run in five. If a test passes only on the second try, the report says so: look at it |
| `test/integration/` | The older HTTP suite that `npm test` runs against one server (`server.js` starts it, `runTests.js` lists the suites) |
| `test/helpers/` | What the backend tests share: `app.js` boots a CMS, `cmsInstance.js` holds the shared options, `engines.js` the storage engines of the contract suite, `quiet.js` the log level |
| `test/fixtures/` | Data the tests read: the `resources/` of the shared CMS, `contractResources/` for the contract suite, `ossResources/` for the OSS tests, `man.jpg` and the `smartCrop/` reference pictures |
| `test/bench/` | The benchmarks (`npm run bench:stores`, `bench.js`, `compare.js`) and their own `resources/` |
| `test/security/` | One regression test per finding of the backend security audit: `auth` (passwords, sessions, login limits, revocation), `http` (headers, CSRF, CORS, errors), `uploads`, `query`, `rest`, `importFromRemote` (SSRF), `replication` (handshake, peer validation), `websocket` |
| `test/unit/authentication*` | Passwords, login, retry blocking, group permissions, JWT handling |
| `test/unit/driver*`, `resource*`, `locking*` | CRUD, hooks, unique keys, concurrency, attachments, import maps |
| `test/unit/localEngines*` | The three local engines behind one interface (ranges, paging, scan, count, hooks, reopen), the choice in `cms.json`, and the migration between them |
| `test/unit/stores*`, `jsondown*`, `queryNeedles*`, `paging*`, `importMap*` | `JsonStore`, `FileStore` (including path traversal), the JSON file engine (ordering, ranges, atomic and sliced flush, corrupt files), the text prefilter of queries, paging, the indexed import map |
| `test/unit/drivers.contract.test.js` | The [driver contract suite](#driver-contract-suite) |
| `test/unit/authentication.cache*`, `hardening*`, `security.utils*` | The verified-password cache, ids, and the small security utilities (passwords, redaction, safe regular expressions, file types) |
| `test/unit/replicator.attachments*`, `sync*` | Attachment download between peers, the low-level store sync |
| `test/unit/rest.attachments*`, `ossHelper*`, `admin*`, `updates*`, `syslog.system*` | REST attachment routes, attachments kept in Alibaba Cloud OSS (the client stood in for), admin plugin, websocket updates, log and system streams |
| `test/unit/xlsx*`, `sync*`, `import*`, `importFromRemote*`, `replicator*` | The plugins, each checked through its real routes |
| `test/unit/pageHelper*` | The [PageHelper](../reference/PAGE_HELPER.md): the templates read and checked at the start, each way a kept page can be old (a template, a record, the age, a damaged file), the memory and the folder, errors and 404 pages, many requests at once. `pageHelper.edge.test.js` stands a small CMS in for the real one, so that each failure is made on purpose |
| `test/unit/contentLoader*` | The [ContentLoader](../operations/CONTENT_LOADER.md) and `cms-load`: every problem it reports, relations, dates, files (a path, an object, a buffer, a stream, a language), blocks, a second load, a dry run; `contentLoader.cli.test.js` runs the real executable in a project folder and checks its output and exit codes, `contentLoader.resources.test.js` uses resources of its own (blocks, localised fields, nested fields) |
| `test/unit/exampleMagazine*` | The example [magazine](../examples/magazine/README.md): its content loaded from `content.json`, each page and language, the search, the feed, the sitemap, the dates the browser is told, 404 and error pages, and the template engine |
| `test/unit/examples.test.js` | **Every example of `docs/examples` held to the same bar**, so that no change of the CMS breaks one without a test saying so. For the blog, the magazine, the docs platform and Boardwalk alike (they are listed in `test/helpers/examples.js`): the resources are the CMS's, the content file loads and loads again with nothing to do, a dry run finds no problem, a crawl (`test/helpers/crawl.js`) follows every link, picture and stylesheet of the site and finds no broken one and no page that shows `undefined`, and the real `server.js` is run as `node server.js` over a folder of its own, serves its first page, and starts again over what it kept (for Boardwalk, a single-page app, a crawl of what its page loads: it builds the app on its first start, and every script and stylesheet the page names must be there). A new folder in `docs/examples` that is not in the list fails a test |
| `test/unit/exampleSite*` | The example [blog](../examples/site/README.md): its four articles, the home page, the list in pages, an article, the page of a 404 and of an error, what it escapes, and that its pages are kept and made again when an article or a template changes |
| `test/frontend/taskboard.*` | The app **Boardwalk** ([the tutorial](../examples/taskboard/README.md)) in four levels, with the others of the frontend suite. `taskboard.lib`: the order of the cards (a position between neighbours, renumbering) and the filters, pure. `taskboard.api`: the HTTP client, the session and the websocket, with a false `fetch`, XHR and WebSocket. `taskboard.stores`: the collection and the board over a fake of the REST API that keeps its records in memory (`helpers/taskboard.js`), with calls that wait for the test so that answers come in the wrong order. `taskboard.components`: the whole app mounted with its router: signing in, the board, the filter in the address, a drag, the card with its conflicts, the comments, the files |
| `test/unit/exampleTaskboard*` | Boardwalk over a **real CMS**: the hooks (numbers that two parallel creates cannot share, an author that is the account), the rights of its group, and the very modules of the app driven from Node with a real login cookie, a real websocket and a real upload: what a fake cannot tell (a removal has no id, a file is announced by its own id, the message of one's own write can come before its answer) |
| `test/unit/exampleDocker*` | The [Docker example](../examples/docker/README.md), a deployment: that `.env` is left out of git and out of the build, that the Dockerfile has no `ARG`, no secret `ENV` and no `COPY . .`, that `compose.yaml` hands the secrets over by `env_file` and has none (no `environment`, no build `args`), publishes on 127.0.0.1 only and is read-only, that `.env.example` names every variable `server.js` reads, that `scripts/env.sh` makes, keeps and checks the file (run only where there is a bash), and the real `server.js` in production: it refuses to start without the secrets, serves the notes to everybody and the users to the administrator it made, writes no secret in its data, exits with 0 on SIGTERM and starts again over what it kept. Docker is not needed: the image is built and run by hand when the folder changes |
| `test/unit/examplePlatform*` | The example [docs platform](../examples/platform/README.md): that the public site has no route of the CMS, the addresses of the versions (`latest`, the first page, an old version, a draft), the one rule about who reads what for pages, diagrams, PDFs and search, a product for members that shows nothing of itself, the members and their secrets (hashed on write, hidden on every read, only the sign-in reads them), the sign-in and its protections (token, limit, new session, one answer for every reason), the support form from a page, and each failure ending in a page that says nothing of the cause |
| `test/unit/cms.class*` | Configuration, secrets, plugin loading, resources, paragraphs, lifecycle |
| `test/frontend/` | `validators`, `sanitizeHtml`, the request/translate/login/resource/config services |

## Component tests

`test/frontend/*.component.test.js` mount real components with `@vue/test-utils`, inside jsdom. `test/frontend/helpers/mountField.js` builds the same environment as the app (Vuetify with its icon set, the `$filters` global, the real English dictionary from `i18n/enUS.json`, so a test reads what a person sees and a renamed translation key fails it).

```js
import CustomCheckbox from '@c/fields/CustomCheckbox.vue'
import { mountField, mountComponent } from './helpers/mountField.js'

const wrapper = mountField(CustomCheckbox, { model: {}, schema: { model: 'flag', label: 'Flag' } })
await wrapper.get('[role=switch]').trigger('click')
expect(wrapper.emitted('input')[0]).toEqual([true, 'flag'])
```

`mountField` is for the fields (props `model` and `schema`); `mountComponent` for everything else. `test/frontend/helpers/setup.js` stubs what jsdom lacks (`ResizeObserver`, `matchMedia`, `scrollIntoView`). jsdom has no layout, so tests check structure, attributes, classes, emitted events and state, not pixel positions: layout and appearance stay a matter for the browser (and the design-system test, which reads the CSS).

Two things bite in jsdom: a list that uses the virtual scroller needs a stand-in that renders every item (see `recordList.component.test.js`), and a component that marks the records it is given (the record list does) needs its own copies of them in every test. The record editor ignores changes for 700 ms after it opens (fields fill in their own defaults), so a test that edits the model advances its fake timers first (see `recordEditor.component.test.js`). `app.component.test.js` mounts `App` with a real router (memory history) and fake timers, because the address follows the selection 60 ms later, and the services are mocked with `vi.mock`. `paragraphView.component.test.js` stands in for the draggable list and the nested form and mocks `ResourceService` and `SchemaService` (the paragraph types come from `getParagraphSchema`, which must return a fresh copy each time because the component edits what it gets). `jsonEditor.component.test.js` runs the real library: it builds its form a moment after the constructor returns, so a test waits for `originalValue` (set when it is ready) and for the library's own changes with `vi.waitFor`; CodeMirror needs the `Range` measurements stubbed in `helpers/setup.js`. The navigation tests share a small menu in `helpers/navFixtures.js`, advance fake timers for the rail's hover delays, and stub `offsetParent` where the keyboard code asks which buttons are shown (jsdom has no layout). `customDatetimePicker.component.test.js` builds the three schemas `FormService` makes for date, time and datetime and runs the real @vuepic/vue-datepicker; the installed version has no `enableDatePicker` prop (the component's own state says whether a calendar is shown), so a test reads `wrapper.vm` for it. `systemInfo.component.test.js` stands in for `EventSource` (a class the test drives: `message`, `fail`, `end`) and uses fake timers, because the stream connects after a second and reconnects with growing delays. `fileFields.component.test.js` puts files in the upload box the way a browser does (it defines `files` on the native input and dispatches `change`, because the box validates the files it holds, not the ones handed to the handler) and reads real `File` objects with the jsdom `FileReader`; the cropper is stood in for. Also: a field sets its password-manager attributes one tick after mounting (`await wrapper.vm.$nextTick()`), and timers (toasts) are tested with `vi.useFakeTimers()`.

## Driver contract suite

`test/unit/drivers.contract.test.js` runs one set of tests (CRUD, timestamps, unique keys, every supported query operator, paging, import maps, attachments, a restart on the same data) against each storage engine, through the public resource API:

| Engine | Needs |
|---|---|
| json file store | nothing, always runs |
| SQLite | nothing, always runs |
| LevelDB | the `classic-level` package (an optional dependency; skipped when it did not install) |
| PostgreSQL | a server; `TEST_POSTGRES_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`) |
| MongoDB | a server; `TEST_MONGODB_URL` (default `mongodb://localhost:27017`) |

Every run works in a database of its own and drops it afterwards. When no server answers, that engine's part is **skipped** (shown as pending), so the suite runs anywhere. `REQUIRE_DATABASES=1` turns a missing server into a failure: the `drivers` job of the CI workflow sets it and starts both servers as service containers.

To run it locally against both servers (`-g PostgreSQL` or `-g MongoDB` picks one):

```sh
REQUIRE_DATABASES=1 \
TEST_POSTGRES_URL=postgres://postgres:<password>@localhost:5432/postgres \
TEST_MONGODB_URL=mongodb://localhost:27017 \
  npx mocha test/unit/drivers.contract.test.js
```

The suite is 60 tests per engine, 300 in all with the five engines. The servers can be anywhere the machine reaches: a server in WSL 2 is reached from Windows through the address of the WSL network interface (see [below](#or-run-the-tests-in-wsl)).

To add an engine, add an entry to `test/helpers/engines.js` that resolves with the CMS options selecting it and a teardown.

## Benchmarks

Three benchmark tools live in `test/bench/`, none of them part of CI:

- `stores.js` compares the storage engines themselves, without the CMS around them: speed, memory, disk space, and what a crash loses.
- `engines.js` starts the real CMS on each engine and drives it through REST: create, read, update, delete, list, find, filter and file upload and download, with one client and with several (`npm run bench:engines`).
- `bench.js` profiles the backend on one store, below.

[STORAGE.md](../operations/STORAGE.md#how-fast-are-they-really) has the results of the first two, and how to run them.

`test/bench/bench.js` seeds a CMS with seeded pseudo-random records (10 000 and 100 000) and measures list, paging, lookups, filters, create/update/remove latency, event-loop stalls during a burst of writes, flush time, reboot time, memory, the xlsx export and attachment serving through the real HTTP stack.

```sh
node --expose-gc test/bench/bench.js --sizes 10000,100000 --json after.json
node --expose-gc test/bench/bench.js --sizes 100000 --only write,flush     # one group
node test/bench/compare.js before.json after.json                          # markdown table
```

Run it on an otherwise idle machine, and compare two runs made on the same one. A performance change is kept only when the benchmark shows it.

## Known bugs kept visible

A test marked `it.skip` documents a bug that is understood but not fixed yet, with the reason in a comment. There are none at the moment.

## Coverage, and its limits

- **Alibaba Cloud OSS attachments** are covered by `test/unit/ossHelper.test.js`. The `ali-oss` client is stood in for by an in-memory object store that records every call, so nothing leaves the process. The helper is tested alone (object keys, the config file, upload, download, delete, each error path) and inside a resource (`test/fixtures/ossResources`): an attachment on an OSS field goes to the object store and never to the blob folder, is read back and resized from there, is deleted from there with the attachment or with its record, a field with OSS options but `method: 'disk'` stays on disk, and a store that fails answers an error without leaving a file or a record behind.
- **MongoDB and PostgreSQL** run the whole [driver contract suite](#driver-contract-suite) against real servers: locally with `TEST_MONGODB_URL` and `TEST_POSTGRES_URL` (and `REQUIRE_DATABASES=1` to turn a server that does not answer into a failure), and on every push in the `drivers` job of `.github/workflows/test.yml`, where MongoDB 7 and PostgreSQL 16 are service containers. The two-node replication scenarios (`test/unit/replicator*.test.js`, `test/unit/sync*.test.js`) run on the local engines: the replicator plugin, the peer handshake and the record ownership rules they exercise are shared by every engine, and the suite does not start a second node on MongoDB or PostgreSQL.
- **A power cut** is outside what a test can do: the crash test (`npm run bench:stores:crash`) kills the process, and the operating system keeps writing what the process had handed it. [STORAGE.md](../operations/STORAGE.md#what-happens-if-the-process-is-killed) says what each engine does about it.
- **Vue components**: every component under `src/components` is mounted by a test in `test/frontend` (see [Component tests](#component-tests)): the fields (switch, text, textarea, pillbox, selects, colour, date, time and datetime pickers, image and file fields with their previews, blocks, object and list fields with the real @json-editor library and CodeMirror, rich text editor and its toolbar, code editor, slug, group and tree), the record list, table (grid, cell, column menu) and record editor, the app itself (routing, the address, the unsaved-edits guard, the breadcrumb), the navigation (rail, flyouts, resource list, quick switcher, top bar, system menu with its live stream), the login page, the plugin pages (import, sync, configuration editor, log viewer, design system), the toasts, dialog, search field, resource selector, language switch, brand mark, updates notifier, uploads panel and selection page. `FormService` (the input types and their checks) and `SchemaService` (a resource schema becoming a form) are tested as modules.

## Random ETIMEDOUT failures on one machine

The tests start a server in the process and connect to it over the loopback interface, hundreds of times. On a machine where something (a firewall, a network filter driver, an antivirus network inspection) drops the first packet to a freshly opened local port, a random test fails with `ETIMEDOUT` (`AggregateError [ETIMEDOUT]` from `internalConnectMultiple`, or `connect ETIMEDOUT 127.0.0.1:<port>`). Which tests fail changes from run to run, and a single file can pass, then fail 5 tests, then pass.

Check the machine, without any CMS code:

```bash
node test/helpers/loopbackCheck.js
```

A healthy machine prints `{"ok":300}` for both hosts. The Windows developer machine this was found on printed `{"ok":297,"ETIMEDOUT":3}` for `127.0.0.1` (about 1 connection in 100). Moving the temporary folder to another drive made no difference.

Run the suite with retries on such a machine:

```bash
MOCHA_RETRIES=2 npm run test:unit    # 654 passing, 0 failing on that machine
```

CI leaves `MOCHA_RETRIES` unset, so a test that really is flaky stays visible there.

### Or run the tests in WSL

On Windows, a WSL Ubuntu runs the whole backend suite without the connection problem, and it can host the databases the CI `drivers` job uses, which Docker Desktop could not do on the machine above (Windows refused to create unix sockets, so Docker would not start). In Ubuntu 24.04:

```bash
sudo apt-get install -y postgresql                       # PostgreSQL 16
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres'"
# MongoDB 7: add MongoDB's apt repository (jammy/mongodb-org/7.0 works on 24.04), then
sudo apt-get install -y mongodb-org-server
mongod --dbpath ~/mongo-data --bind_ip 127.0.0.1 --fork --logpath ~/mongod.log

git clone /mnt/d/path/to/embed-cms ~/embed-cms && cd ~/embed-cms && npm ci   # a copy on the Linux disk: much faster than /mnt
REQUIRE_DATABASES=1 \
TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres \
TEST_MONGODB_URL=mongodb://localhost:27017 npm run test:unit            # 803 passing, 0 failing, about 30 seconds
```

The same two servers also serve a checkout on the Windows side (the tests, and the benchmarks of [STORAGE.md](../operations/STORAGE.md#run-it-yourself)). Windows reaches a WSL 2 service through the address of the WSL network interface (`hostname -I` inside WSL, `172.x.x.x`), and only when the service listens on that interface, so both servers listen on every interface and PostgreSQL accepts the WSL subnet:

```bash
# inside WSL
sudo sed -i "s/^#\?listen_addresses = .*/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf
echo "host    all             all             172.16.0.0/12           scram-sha-256" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf
sudo systemctl restart postgresql
mongod --dbpath ~/mongo-data --bind_ip_all --fork --logpath ~/mongod.log
hostname -I                                              # the address Windows uses, <wsl-ip> for example
```

```bash
# on Windows, in the checkout
REQUIRE_DATABASES=1 \
TEST_POSTGRES_URL=postgres://postgres:postgres@<wsl-ip>:5432/postgres \
TEST_MONGODB_URL=mongodb://<wsl-ip>:27017 npx mocha test/unit/drivers.contract.test.js   # 300 passing
```

The WSL address changes when WSL restarts; `hostname -I` gives the current one. Windows forwards `localhost` to WSL only for some services and machines, and a connection that times out on `localhost` works through the interface address.

A flaky test is easiest to catch by repeating it: loop `npx mocha test/unit/drivers.contract.test.js --grep "unique keys"` a few hundred times. That is how the record id bug (an id whose time part ends in "42" looked foreign to a machine id made of "42"s, see `lib/util/localId.js`) was found: a test that failed 2 runs in 150 was written as a loop of its own, and then failed 250 times in 800.

