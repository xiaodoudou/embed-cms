# Testing

There are three suites, plus a benchmark and a database contract suite. All of them but the benchmark run in CI
(`.github/workflows/test.yml`).

| Command | What it runs | Notes |
|---|---|---|
| `npm run test:unit` | `test/unit` and `test/security` (mocha) | In-process, no fixed ports, no shared state |
| `npm run test:frontend` | `test/frontend` (vitest + jsdom) | Pure logic (validators, table model, dirty tracker, services) and real components mounted with Vuetify |
| `npm test` | `test/runTests.js` (legacy HTTP integration suite) | Starts a server; set `TEST_PORT` to avoid clashes (default 9990) |
| `npm run test:coverage` | the unit suite under `c8` | Prints a coverage summary for `lib/` and `index.js` |
| `npm run test:all` | all of the above | |
| `node --expose-gc test/bench/bench.js` | The performance benchmark | Not part of CI, see [Benchmarks](#benchmarks) |

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

`startApp(overrides, { dataDir, keepData, beforeMount })` can boot a second time on the same data (`keepData` keeps the folder
when the first app closes), and can hand the host express app to `beforeMount` before the CMS is mounted.
Other helpers: `hardened(overrides)` (a production like app: fresh random secrets, the strict secret policy and no built-in `localAdmin`), `randomSecret()`,
`createUser(app)` and `withNodeEnv(value, fn)`. Secrets in tests are always generated, never literals.

The shared test options (`test/cmsInstance.js`) turn on both login modes (`disableJwtLogin: false`,
`disableAuthentication: false`), unlike the defaults of a real install. Tests must pick the right one:

- default (`disableAuthentication: false`): REST accepts HTTP Basic credentials, and the protected admin routes
  (`/admin/resources`, `/import`, `/replicator`, ...) accept a login **session** (`request.agent(...).post('/admin/login')`);
- JWT mode (pass `disableAuthentication: true`; `disableJwtLogin` is already `false`): cookies are parsed and the JWT
  cookie authenticates every route.

Every protection is on by default (see `SECURITY.md`). Tests run with the development defaults (`localAdmin` and the
default secrets allowed) unless they call `hardened()`; a security regression test normally runs on both.

## Quiet logs

The CMS logs every refused request, failed login and boot warning, and the tests provoke all of them on purpose, so `.mocharc.cjs` loads
`test/helpers/quiet.js`, which sets the log level to `silent`. A run prints test results, not stack traces. When a test fails and you want
the CMS's side of the story, run it with the logs back on:

```bash
TEST_LOGS=1 npx mocha test/unit/rest.errors.unit.test.js
```

Setting `LOG_LEVEL` does the same (`LOG_LEVEL=debug` shows even the refused requests, which are logged at debug level). A test that checks
what is logged patches `logger.warn` and friends itself (see `test/unit/logging.refused.unit.test.js`), so it does not depend on the level.

## Layout

| Path | Covers |
|---|---|
| `test/security/` | One regression test per finding of the backend security audit: `auth` (passwords, sessions, login limits, revocation), `http` (headers, CSRF, CORS, errors), `uploads`, `query`, `rest`, `importFromRemote` (SSRF), `replication` (handshake, peer validation), `websocket` |
| `test/unit/authentication*` | Passwords, login, retry blocking, group permissions, JWT handling |
| `test/unit/driver*`, `resource*`, `locking*` | CRUD, hooks, unique keys, concurrency, attachments, import maps |
| `test/unit/localEngines*` | The three local engines behind one interface (ranges, paging, scan, count, hooks, reopen), the choice in `cms.json`, and the migration between them |
| `test/unit/stores*`, `jsondown*`, `queryNeedles*`, `paging*`, `importMap*` | `JsonStore`, `FileStore` (including path traversal), the JSON file engine (ordering, ranges, atomic and sliced flush, corrupt files), the text prefilter of queries, paging, the indexed import map |
| `test/unit/drivers.contract.test.js` | The [driver contract suite](#driver-contract-suite) |
| `test/unit/authentication.cache*`, `hardening*`, `security.utils*` | The verified-password cache, ids, and the small security utilities (passwords, redaction, safe regular expressions, file types) |
| `test/unit/replicator.attachments*`, `sync*` | Attachment download between peers, the low-level store sync |
| `test/unit/rest.attachments*`, `admin*`, `updates*`, `syslog.system*` | REST attachment routes, admin plugin, websocket updates, log and system streams |
| `test/unit/xlsx*`, `sync*`, `import*`, `importFromRemote*`, `replicator*` | The plugins (these replace the old, disabled `test/xlsx|sync|import|importFromRemote.test.js`, which accepted 404 as a pass) |
| `test/unit/cms.class*` | Configuration, secrets, plugin loading, resources, paragraphs, lifecycle |
| `test/frontend/` | `validators`, `sanitizeHtml`, the request/translate/login/resource/config services |

## Component tests

`test/frontend/*.component.test.js` mount real components with `@vue/test-utils`, inside jsdom. `test/frontend/helpers/mountField.js`
builds the same environment as the app (Vuetify with its icon set, the `$filters` global, the real English dictionary from
`i18n/enUS.json`, so a test reads what a person sees and a renamed translation key fails it).

```js
import CustomCheckbox from '@c/fields/CustomCheckbox.vue'
import { mountField, mountComponent } from './helpers/mountField.js'

const wrapper = mountField(CustomCheckbox, { model: {}, schema: { model: 'flag', label: 'Flag' } })
await wrapper.get('[role=switch]').trigger('click')
expect(wrapper.emitted('input')[0]).toEqual([true, 'flag'])
```

`mountField` is for the fields (props `model` and `schema`); `mountComponent` for everything else. `test/frontend/helpers/setup.js` stubs what
jsdom lacks (`ResizeObserver`, `matchMedia`, `scrollIntoView`). jsdom has no layout, so tests check structure, attributes, classes, emitted events
and state, not pixel positions: layout and appearance stay a matter for the browser (and the design-system test, which reads the CSS).

Two things bite in jsdom: a list that uses the virtual scroller needs a stand-in that renders every item (see `recordList.component.test.js`), and a component that marks the records it is given (the record list does) needs its own copies of them in every test. The record editor ignores changes for 700 ms after it opens (fields fill in their own defaults), so a test that edits the model advances its fake timers first (see `recordEditor.component.test.js`). `app.component.test.js` mounts `App` with a real router (memory history) and fake timers, because the address follows the selection 60 ms later, and the services are mocked with `vi.mock`. `paragraphView.component.test.js` stands in for the draggable list and the nested form and mocks `ResourceService` and `SchemaService` (the paragraph types come from `getParagraphSchema`, which must return a fresh copy each time because the component edits what it gets). `jsonEditor.component.test.js` runs the real library: it builds its form a moment after the constructor returns, so a test waits for `originalValue` (set when it is ready) and for the library's own changes with `vi.waitFor`; CodeMirror needs the `Range` measurements stubbed in `helpers/setup.js`. The navigation tests share a small menu in `helpers/navFixtures.js`, advance fake timers for the rail's hover delays, and stub `offsetParent` where the keyboard code asks which buttons are shown (jsdom has no layout). `customDatetimePicker.component.test.js` builds the three schemas `FormService` makes for date, time and datetime and runs the real @vuepic/vue-datepicker; the installed version has no `enableDatePicker` prop (the component's own state says whether a calendar is shown), so a test reads `wrapper.vm` for it. `systemInfo.component.test.js` stands in for `EventSource` (a class the test drives: `message`, `fail`, `end`) and uses fake timers, because the stream connects after a second and reconnects with growing delays. `fileFields.component.test.js` puts files in the upload box the way a browser does (it defines `files` on the native input and dispatches `change`, because the box validates the files it holds, not the ones handed to the handler) and reads real `File` objects with the jsdom `FileReader`; the cropper is stood in for. Also: a field sets its password-manager attributes one tick after mounting (`await wrapper.vm.$nextTick()`), and timers (toasts) are
tested with `vi.useFakeTimers()`.

## Driver contract suite

`test/unit/drivers.contract.test.js` runs one set of tests (CRUD, timestamps, unique keys, every supported query operator,
paging, import maps, attachments, a restart on the same data) against each storage engine, through the public resource API:

| Engine | Needs |
|---|---|
| json file store | nothing, always runs |
| SQLite | nothing, always runs |
| LevelDB | the `classic-level` package (an optional dependency; skipped when it did not install) |
| PostgreSQL | a server; `TEST_POSTGRES_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`) |
| MongoDB | a server; `TEST_MONGODB_URL` (default `mongodb://localhost:27017`) |

Every run works in a database of its own and drops it afterwards. When no server answers, that engine's part is **skipped**
(shown as pending), so the suite runs anywhere. `REQUIRE_DATABASES=1` turns a missing server into a failure: the `drivers`
job of the CI workflow sets it and starts both servers as service containers.

To run it locally against PostgreSQL:

```sh
TEST_POSTGRES_URL=postgres://postgres:<password>@localhost:5432/postgres \
  npx mocha test/unit/drivers.contract.test.js -g PostgreSQL
```

To add an engine, add an entry to `test/helpers/engines.js` that resolves with the CMS options selecting it and a teardown.

## Benchmarks

`test/bench/stores.js` compares the storage engines themselves, without the CMS around them: speed, memory, disk space, and what a
crash loses. See [STORAGE.md](STORAGE.md#measured) for the results and how to run it.

`test/bench/bench.js` seeds a CMS with seeded pseudo-random records (10 000 and 100 000) and measures list, paging, lookups,
filters, create/update/remove latency, event-loop stalls during a burst of writes, flush time, reboot time, memory, the
xlsx export and attachment serving through the real HTTP stack.

```sh
node --expose-gc test/bench/bench.js --sizes 10000,100000 --json after.json
node --expose-gc test/bench/bench.js --sizes 100000 --only write,flush     # one group
node test/bench/compare.js before.json after.json                          # markdown table
```

Run it on an otherwise idle machine, and compare two runs made on the same one. A performance change is kept only when
the benchmark shows it.

## Known bugs kept visible

A test marked `it.skip` documents a bug that is understood but not fixed yet, with the reason in a comment. There are none at
the moment.

## Not covered yet

- The MongoDB driver contract tests were written without a MongoDB server at hand: the `drivers` CI job is their first run, and the PostgreSQL driver runs
  the contract suite but not the two-node replication scenarios.
- `OSSHelper` upload and download paths (needs `ali-oss` stubbed).
- Vue components: every one under `src/components` is mounted by a test, in `test/frontend`: the switch, the text input and textarea, the pillbox, the select fields, the colour picker, the date, time and datetime pickers, the image and file fields with their previews (`ImageView`, `AttachmentView`, `ShowAttachment`, `PreviewAttachment`, `PreviewMultiple`, `FileInputErrors`), the toasts, the dialog, the search field, the record list, the record editor (with its form stood in for), the app itself (routing, the address, the unsaved-edits guard, the breadcrumb, with its children stood in for), the blocks field (`ParagraphView`), the object and list fields (`JsonEditor`, with the real @json-editor library and CodeMirror) the navigation (the collapsed rail with its flyouts, the expanded resource list, the quick switcher, the top bar and the system menu with its live stream) and the table (grid, cell, column menu), the resource selector, the language switch, the brand mark, the login page, the plugin pages (import, sync, configuration editor, log viewer, design system), the rich text editor and its toolbar, the code editor, the slug, group and tree fields, the form that draws a schema (`CustomForm`), what the editors share (`AbstractEditorView`), the updates notifier, the uploads panel and the selection page (see
  [Component tests](#component-tests)), and `FormService` (the input types and their checks) and `SchemaService` (a resource schema becoming a form) are tested as modules.

## Random ETIMEDOUT failures on one machine

The tests start a server in the process and connect to it over the loopback interface, hundreds of times. On a machine
where something (a firewall, a network filter driver, an antivirus network inspection) drops the first packet to a
freshly opened local port, a random test fails with `ETIMEDOUT` (`AggregateError [ETIMEDOUT]` from `internalConnectMultiple`,
or `connect ETIMEDOUT 127.0.0.1:<port>`). Which tests fail changes from run to run, and a single file can pass, then
fail 5 tests, then pass.

Check the machine, without any CMS code:

```bash
node test/helpers/loopback-check.js
```

A healthy machine prints `{"ok":300}` for both hosts. The Windows developer machine this was found on printed
`{"ok":297,"ETIMEDOUT":3}` for `127.0.0.1` (about 1 connection in 100). Moving the temporary folder to another drive
made no difference.

Run the suite with retries on such a machine:

```bash
MOCHA_RETRIES=2 npm run test:unit    # 654 passing, 0 failing on that machine
```

CI leaves `MOCHA_RETRIES` unset, so a test that really is flaky stays visible there.

### Or run the tests in WSL

On Windows, a WSL Ubuntu runs the whole backend suite without the connection problem, and it can host the databases the CI `drivers`
job uses, which Docker Desktop could not do on the machine above (Windows refused to create unix sockets, so Docker would not start).
In Ubuntu 24.04:

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

A flaky test is easiest to catch by repeating it: loop `npx mocha test/unit/drivers.contract.test.js --grep "unique keys"` a few
hundred times. That is how the record id bug (an id whose time part ends in "42" looked foreign to a machine id made of "42"s, see
`lib/util/localId.js`) was found: a test that failed 2 runs in 150 was written as a loop of its own, and then failed 250 times in 800.

