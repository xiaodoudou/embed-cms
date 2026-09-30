# Testing

There are three suites, plus a benchmark and a database contract suite. All of them but the benchmark run in CI
(`.github/workflows/test.yml`).

| Command | What it runs | Notes |
|---|---|---|
| `npm run test:unit` | `test/unit` and `test/security` (mocha) | In-process, no fixed ports, no shared state |
| `npm run test:frontend` | `test/frontend` (vitest + jsdom) | Validators, HTML helpers, services |
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
Other helpers: `hardened(overrides)` (selects the hardened security profile with fresh random secrets), `randomSecret()`,
`createUser(app)` and `withNodeEnv(value, fn)`. Secrets in tests are always generated, never literals.

Two authentication modes exist and tests must pick the right one:

- default (`disableAuthentication: false`): REST accepts HTTP Basic credentials, and the protected admin routes
  (`/admin/resources`, `/import`, `/replicator`, ...) accept a login **session** (`request.agent(...).post('/admin/login')`);
- JWT mode (`disableAuthentication: true`): cookies are parsed and the JWT cookie authenticates every route.

The security behaviour has two profiles (see `SECURITY.md`). Tests run on the `legacy` profile unless they call
`hardened()`; a security regression test normally runs on both, to show what the default keeps and what the profile fixes.

## Layout

| Path | Covers |
|---|---|
| `test/security/` | One regression test per finding of `docs/BACKEND_AUDIT.md`: `auth` (passwords, sessions, login limits, revocation), `http` (headers, CSRF, CORS, errors), `uploads`, `query`, `rest`, `importFromRemote` (SSRF), `replication` (handshake, peer validation), `websocket` |
| `test/unit/authentication*` | Passwords, login, retry blocking, group permissions, JWT handling |
| `test/unit/driver*`, `resource*`, `locking*` | CRUD, hooks, unique keys, concurrency, attachments, import maps |
| `test/unit/stores*`, `jsondown*`, `queryNeedles*`, `paging*`, `importMap*` | `JsonStore`, `FileStore` (including path traversal), the JSON file engine (ordering, ranges, atomic and sliced flush, corrupt files), the text prefilter of queries, paging, the indexed import map |
| `test/unit/drivers.contract.test.js` | The [driver contract suite](#driver-contract-suite) |
| `test/unit/authentication.cache*`, `hardening*`, `security.utils*` | The verified-password cache, ids, and the small security utilities (passwords, redaction, safe regular expressions, file types) |
| `test/unit/replicator.attachments*`, `sync*` | Attachment download between peers, the low-level store sync |
| `test/unit/rest.attachments*`, `admin*`, `updates*`, `syslog.system*` | REST attachment routes, admin plugin, websocket updates, log and system streams |
| `test/unit/xlsx*`, `sync*`, `import*`, `importFromRemote*`, `replicator*` | The plugins (these replace the old, disabled `test/xlsx|sync|import|importFromRemote.test.js`, which accepted 404 as a pass) |
| `test/unit/cms.class*` | Configuration, secrets, plugin loading, resources, paragraphs, lifecycle |
| `test/frontend/` | `validators`, `sanitizeHtml`, the request/translate/login/resource/config services |

## Driver contract suite

`test/unit/drivers.contract.test.js` runs one set of tests (CRUD, timestamps, unique keys, every supported query operator,
paging, import maps, attachments, a restart on the same data) against each storage engine, through the public resource API:

| Engine | Needs |
|---|---|
| json file store | nothing, always runs |
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
- `OSSHelper` upload and download paths (needs `ali-oss` stubbed) and the smart-crop internals.
- Vue components, `FormService` and `SchemaService` (they pull in the whole Vuetify component map).

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
