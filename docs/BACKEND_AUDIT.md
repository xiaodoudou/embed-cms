# Backend security and performance audit

Scope: `index.js`, `lib/`, `lib-importFromRemote/`, and the default configuration. Frontend code is out of scope.
Baseline: branch `claude/security-tests-refactor` (head `f2531c4`), Node 22.22, `npm audit`: 0 vulnerabilities.

Findings marked **confirmed** were reproduced against a running in-process CMS (`test/helpers/app.js`) before being written
down. The others were established by reading the code and are labelled **code review**. "PoC test" is the regression test
that will be written first in the phase that fixes the finding (it must fail on the current code). Tests that need a
database are marked *(db)*.

Already fixed in earlier passes and not repeated here: query operator allow-list, prototype pollution guards, path traversal
guards in `FileStore` and `importFromRemote`, constant-time compares, auth on `/import`, `/importFromRemote`, `/replicator`,
idempotent create locking, resize size limits.

## Summary

| Id | Sev | Area | Title | Phase |
|---|---|---|---|---|
| SEC-01 | critical | replication | Replication TCP port is unauthenticated, accepts any resource name (directory traversal) and any record | 4 |
| SEC-02 | critical | query | ReDoS: `$regex` blocks the event loop (46 s for a 31 character record) | 3 |
| SEC-03 | critical | auth | Built-in `localAdmin/localAdmin` account is created at every boot | 2 |
| SEC-04 | critical | secrets | Default `auth.secret` and `session.secret` are accepted in production | 2 |
| SEC-05 | high | uploads | Stored XSS: attachments are served inline with an attacker chosen content type | 3 |
| SEC-06 | high | auth | Password hashing is PBKDF2-HMAC-SHA1 with 100 iterations, no version marker | 2 |
| SEC-07 | high | auth | Password hash and salt leak through the JWT, the login response and `GET /api/_users/:id` | 2 |
| SEC-08 | high | auth | Login lockout is off by default, bypassable with an object as user name, and leaks account existence | 2 |
| SEC-09 | high | auth | Cookies lack `Secure` and `SameSite`, the JWT cookie is not `HttpOnly`, anonymous requests create sessions | 2 |
| SEC-10 | high | auth | No CSRF protection, state changing `GET` routes | 2 |
| SEC-11 | high | websocket | Record update socket has no authentication and no origin check | 4 |
| SEC-12 | high | uploads | multer writes to the OS temp dir with no size or count limit and never cleans up | 3 |
| SEC-13 | high | ssrf | `importFromRemote` sends credentials to any attachment URL, logs the password, downloads each file ten times | 3 |
| SEC-14 | high | storage | JSON store writes are not atomic and a parse error silently resets the database to empty | 5 (data integrity) |
| SEC-15 | high | replication | Peer supplied keys and values are written to the store without validation | 4 |
| SEC-16 | medium | auth | Sessions are not regenerated on login, logout does not invalidate the JWT | 2 |
| SEC-17 | medium | admin | `GET /admin/cms-config` returns every secret, `POST` replaces the file and exits the process | 2 |
| SEC-18 | medium | http | No Content-Security-Policy, deprecated `Expect-CT`, `X-Powered-By` leaks on sub apps | 3 |
| SEC-19 | medium | errors | Stack traces and paths reach the client outside production, internal messages echoed | 3 |
| SEC-20 | medium | uploads | `updateAttachment` merges the request body into the attachment metadata (content type, size, md5) | 3 |
| SEC-21 | medium | http | `Access-Control-Allow-Origin: *` on both SSE endpoints | 3 |
| SEC-22 | medium | xlsx | Export temp files use a predictable name, are never deleted, and query one list per column | 3 / 5 |
| SEC-23 | medium | admin | `/admin/fonts/*` answers through the dev proxy in production and hangs (unhandled rejection) | 3 |
| SEC-24 | medium | resource | `checkResourceLimits` never ends the request on error and leaves the resource locked | 3 |
| SEC-25 | medium | replication | Attachment md5 check races with the download list, so changed files are never re-downloaded | 4 |
| SEC-26 | low | auth | Unknown users are answered without hashing (timing user enumeration) | 2 |
| SEC-27 | low | admin | `/admin/_groups` and `/admin/config` are public | 2 |
| SEC-28 | low | ids | Record and attachment ids use `Math.random()` | 3 |
| SEC-29 | low | logs | Password written to the log by `importFromRemote`, client data logged from the websocket | 3 / 7 |
| SEC-30 | low | dead code | `req.session.user.password` is turned into a Basic header (dead but dangerous) | 2 |
| SEC-31 | low | store | Store iterator takes the user query as iterator options (`limit`, `reverse`, `query`), `lt` range is inverted | 6 |
| SEC-32 | low | deps | `helmet` is four majors behind, `sift`, `mkdirp`, `fs-extra`, `commander` are old | 7 |

---

## Critical

### SEC-01 Replication TCP port is unauthenticated (confirmed)
- Files: `lib/plugins/replicator/protocol.js:39-51`, `lib/plugins/replicator/diffie_hellman.js:11,56-77`,
  `lib/plugins/replicator/replicator.js:94-103`, `lib/resource.js:293-294`, `lib/db/leveldown/sync.js:99-123`.
- When `netPort` is set the CMS listens on all interfaces. The "handshake" is a Diffie-Hellman exchange over a public 512 bit
  prime followed by a comparison of the two computed secrets. It authenticates nobody (any client can compute it), it is not
  followed by encryption, and the prime is too small to be safe anyway. The comparison uses `!==`.
- After the handshake the client names a resource. The server calls `cms.resource(name)`, which in `mode: normal` creates a
  new resource for any string. `Resource` builds its data folder with `path.join(data, ns, name, 'json')`, so
  `name = '../../x'` creates and opens a database outside the data directory. **Confirmed**:
  `cms.resource('../../pwn-probe')` created `<data>/../../pwn-probe`.
- Then `json.sync(socket, false)` runs: the peer can pull every record of any resource, including `_users` (password
  hashes and salts), and push puts and deletes for any key (SEC-15).
- Impact: unauthenticated read, write and delete of the whole content store, account takeover, directory creation outside the
  data folder.
- PoC tests: `test/security/replication.security.test.js` — "rejects a peer that does not know the shared secret",
  "does not create a resource for an unknown or traversing name".

### SEC-02 ReDoS in `$regex` (confirmed)
- Files: `lib/util/sanitizeQuery.js:40`, `lib/helpers.js:74` (sift evaluates the pattern against every record).
- The only limit is 200 characters. `{"title":{"$regex":"^(a+)+$"}}` against a record whose title is `'a'.repeat(30)+'!'`
  blocked the event loop for **46.7 s** (single request, one authenticated or anonymous-read user). Every other request
  waits.
- PoC test: `test/security/query.security.test.js` — "does not let a catastrophic $regex block the server".

### SEC-03 Built-in `localAdmin` account (confirmed)
- File: `lib/plugins/authentication/index.js:678-690` (also the `cleanRecord` calls at 640-642).
- Every boot creates `localAdmin` / `localAdmin` in the `admins` group when it does not exist. The unit tests log in with it.
  A production deployment that never changed it is fully open.
- PoC test: `test/security/auth.security.test.js` — "does not create localAdmin in production".

### SEC-04 Default secrets (confirmed by reading `defaultConfig`)
- File: `index.js:70-77`, check at `index.js:218-224`.
- `auth.secret` defaults to a value published in the source; `session.secret` to a 12 character value. The check only
  requires more than 16 characters, so the published default passes. JWTs and session cookies are signed with them.
  (Forging a JWT additionally needs the victim's password hash, see SEC-07, which the same defect leaks.)
- PoC test: `test/security/auth.security.test.js` — "refuses to boot in production with the published default secrets".

## High

### SEC-05 Stored XSS through attachments (confirmed)
- Files: `lib/resource.js:693,750` (content type from `mime.lookup` of the client supplied file name),
  `lib/plugins/rest/routes.js:125-135` (`res.type(contentType)`, no `Content-Disposition`).
- Uploading `x.html` (`<script>`) stored `_contentType: text/html` and `GET /api/articles/<id>/attachments/<aid>` answered
  `Content-Type: text/html; charset=utf-8`, inline, on the CMS origin. `nosniff` does not help against a declared HTML
  type. Anyone with attachment permission can run script in an admin's session by sending the link.
- PoC test: `test/security/uploads.security.test.js` — "serves html attachments as a download with a sandbox policy".

### SEC-06 Weak password hashing
- File: `lib/plugins/authentication/index.js:229-237`.
- `pbkdf2Sync(str, salt, 100, 512, 'SHA1')`: 100 iterations, SHA-1, 512 byte output (hex string of 1024 characters), no
  format marker, synchronous (blocks the loop for every login). Offline cracking is trivial once a hash leaks (SEC-07).
- PoC test: `auth.security.test.js` — "stores new passwords with scrypt in a versioned format".

### SEC-07 Hash and salt leaks (confirmed)
- `authentication/index.js:481-483`: the JWT payload contains `password: <hash>`. The token is returned in the login body and
  set as cookie `nodeCmsJwt` (line 489, no `HttpOnly`), so any XSS (SEC-05) yields the hash. The token is base64, not
  encrypted.
- `authentication/index.js:569`: the login response includes `salt`.
- `authentication/index.js:628`: `hidePassword` is registered `after('read')`, `after('create')` and `after('update')`, not
  `after('find')`. `GET /api/_users/<id>` returns `password` and `salt` (**confirmed**), as does `users.find(id)` from
  plugins.
- `userPasswordChanged` (line 407) looks the user up by hash, which is what makes the hash necessary in the token.
- PoC tests: "does not put the password hash in the JWT", "does not return salt or hash from the login response",
  "does not return salt or hash from GET /api/_users/:id".

### SEC-08 Login lockout (confirmed)
- File: `authentication/index.js:431-470`.
- Off unless `blockRetry` is configured. When on it is keyed by `username` then `ip`. **Confirmed**: after the account was
  locked, `POST /admin/login` with `{"username":{"$regex":"^localAdmin$"},"password":"localAdmin"}` returned 200: the
  object is used as a query by `users.find`, and as a different key in `blockRecordMap`. Locked out requests answer HTTP 500
  with `user (x) from ip (y) is blocked`, which also tells an attacker the account exists (the counter only starts for
  existing users). `blockRecordMap` grows without bound. `req.ip` is used (not the raw header): a spoofed
  `X-Forwarded-For` does **not** bypass it (confirmed), but `trust proxy` is never configured, so behind a reverse proxy
  every client shares the proxy address.
- PoC tests: "rejects a non string user name", "blocks by account and by address even when the user name is an object",
  "answers 429 without revealing whether the account exists".

### SEC-09 Cookies and sessions (confirmed)
- `index.js:73-77, 225-235`, `authentication/index.js:489`.
- `connect.sid`: `Path=/; HttpOnly`, no `Secure`, no `SameSite`. `nodeCmsJwt`: neither `HttpOnly`, `Secure` nor `SameSite`.
  `saveUninitialized: true` and `resave: true` are the defaults: every anonymous request (even `/admin/config`) creates a
  session; with the production `FileStore` this is one file per request, unbounded.
- PoC tests: "sets HttpOnly, SameSite and (behind https) Secure on the session and JWT cookies",
  "does not create a session for an anonymous request".

### SEC-10 CSRF
- Cookie authenticated routes with no CSRF defence: `POST /admin/cms-config`, `PUT/POST/DELETE /api/...` (JWT cookie is
  accepted by `authorize.js:30`), `POST /import/*`, `POST /xlsx/*/import`. State changing `GET` routes: `GET /importFromRemote/execute`
  (`lib/plugins/importFromRemote/index.js:29`), `GET /import/execute`, `GET /admin/changeTheme/:newTheme`
  (`admin/index.js:83`), `GET /sync/:resource/from/:from/to/:to`. With no `SameSite` attribute the browser default (`Lax`)
  still sends the cookie on top level navigations, so the `GET` routes can be triggered from another site.
- PoC tests: "rejects a cookie authenticated write from a foreign origin", "does not run an import on GET from a foreign
  origin".

### SEC-11 Record update websocket
- File: `lib/UpdatesManager.js:18-49`.
- `new WebSocketServer({ server })`: any client, any origin, no authentication, default 100 MiB `maxPayload`, every message
  is logged with `logger.info`. Every create/update/remove of non-underscore resources is broadcast with the resource name,
  record id and `_updatedBy` (`user~group`). **Confirmed**: a socket from `Origin: http://evil.example` was accepted without
  credentials.
- PoC test: "rejects websocket clients that are not logged in" and "rejects a foreign origin".

### SEC-12 Uploads
- Files: `lib/plugins/rest/index.js:7`, `lib/plugins/import/index.js:15`, `lib/plugins/xlsx/index.js:12`
  (`multer({ dest: os.tmpdir() })`), `routes.js:311-341`.
- No `limits` at all (file size, file count, field size), files land in the shared temp dir and are never removed
  (**confirmed**: one leftover file per upload). Disk exhaustion by any user with create permission.
- PoC test: "removes the temporary file after an upload", "rejects an upload above the configured size".

### SEC-13 `importFromRemote`
- Files: `lib-importFromRemote/RequestService.js:108-113,162-195`, `lib-importFromRemote/api.js:61`, `utils.js:getAttachments`.
- Attachment URLs come from remote records; any value starting with `http` is fetched with the login cookie attached, so a
  compromised or malicious remote makes the importer send its JWT to any host (and reach internal addresses).
- `console.warn('will login with', url, auth)` prints the username **and password**.
- `getAttachment` has no `return`/`break` after a successful download: the file is downloaded and written `maxRetries`
  (10) times.
- `addAuthToRequest` sets `Authorization` on the options object instead of `options.headers` (it is never sent).
- PoC tests (`test/security/importFromRemote.security.test.js`): "does not send credentials to a foreign host",
  "does not log the password", "downloads an attachment once".

### SEC-14 JSON store durability
- File: `lib/db/leveldown/jsondown.js:138-168, 211-217`.
- `_persist` writes the whole database with `fs.writeFile` directly to `db.json` (not atomic: a crash leaves a truncated
  file), **twice** in a row (lines 146-166 duplicate the same write), on every debounced change. `_open` treats a JSON parse
  error as "empty database" (`data = {}`), and the next write persists the empty state over the damaged file: a torn write
  followed by a restart loses all records without an error.
- PoC test: `test/unit/jsondown.durability.unit.test.js` — "keeps a damaged file instead of overwriting it",
  "writes through a temporary file".

### SEC-15 Peer supplied records
- File: `lib/db/leveldown/sync.js:107-121`.
- `db.put(data.key, data.value)` and `db.del(data.key)` with whatever the peer sent, including keys that are not replica
  keys, internal keys (`\xFF index`, clocks), and ids that belong to this server (`JsonStore.update/remove` refuse foreign
  ids, the sync path does not). Values are not validated against the resource schema.
- PoC test: "ignores keys outside the replica namespace" and "ignores records that claim a local id".

## Medium

### SEC-16 Session fixation, logout
- `authentication/index.js:551-572` never calls `req.session.regenerate` on login (a pre-login `connect.sid` stays valid).
  `onGetLogout` (528-539) removes the session fields but the JWT (24 h, stateless) stays valid until it expires or the
  password changes.
- PoC tests: "issues a new session id on login", "rejects a token after logout".

### SEC-17 `/admin/cms-config`
- `admin/index.js:438-484`. Admin only, but `GET` returns the raw `cms.json` including `auth.secret`, `session.secret`,
  `replication.auth`, `dbEngine.url` (**confirmed**: the response contains the config). `POST` writes any JSON over the
  file (a backup is kept) and calls `process.exit(0)`. Secrets should be redacted on read and kept when the client sends the
  redacted placeholder back.
- PoC test: "does not return secrets from GET /admin/cms-config".

### SEC-18 Security headers (confirmed)
- `index.js:203-211`. Helmet 4 pieces are enabled one by one: no CSP, `Expect-CT` (deprecated), HSTS sent over plain http,
  `X-Powered-By: Express` still present on responses of sub apps, no `Permissions-Policy`, no `Cross-Origin-Opener-Policy`.
- PoC test: "sends a Content-Security-Policy on the admin pages".

### SEC-19 Errors
- **Confirmed**: `?query={"$where":"1"}` answers 500 with the Express HTML error page, stack trace and absolute paths
  (`sanitizeQuery` errors carry `code: 400`, Express looks at `status`). `parse_query.js:11` passes the error to `next(err)`.
- `admin/index.js:270` (`res.status(500).json(error)`), `sync/index.js:onError`, `xlsx onError`, `replicator/index.js:63-74`
  echo `error.message`. `helpers.js:425-433` put the raw query into error messages.
- Malformed `cropOptions` (`JSON.parse` in `routes.js:329`) gives 500 instead of 400.
- PoC tests: "answers a rejected query with 400 JSON", "does not send a stack trace in production".

### SEC-20 Attachment metadata mass assignment
- `lib/util/driver/index.js:1030` `_.merge(foundAttachment, obj)` with the request body: a client can set `_contentType`
  (turns any file into `text/html`, SEC-05), `_md5sum`, `_size`, `_name`, `_id`.
- PoC test: "does not let a client change the content type of an attachment".

### SEC-21 CORS on SSE
- `lib/SystemManager.js:62`, `lib/SyslogManager.js:91`: `Access-Control-Allow-Origin: *`. Both routes sit behind
  `routesToAuth`, and browsers do not send credentials for a wildcard, so exposure is limited to header/Basic authenticated
  or anonymous configurations, but the wildcard is unnecessary.
- PoC test: "does not answer the SSE endpoints with a wildcard origin".

### SEC-22 xlsx export
- `lib/plugins/xlsx/index.js:520-560`. Temp file `${Date.now()}.xlsx` in the shared temp dir (collision between two exports in
  the same millisecond, world readable, never deleted). `list()` is called once **per column** of every sheet. Token in the
  query string (also `sync`), which ends in access logs and proxies.
- PoC tests: "deletes the export file after sending it", benchmark `test/bench/xlsx.bench.js`.

### SEC-23 `/admin/fonts/*` (confirmed by the baseline)
- `admin/index.js:61,255-257`: the route always calls `serveDevMode`, which fetches from the Vite dev server or, in
  production, reads `dist/index.html` synchronously inside an async handler. When `dist` is absent the rejection is never
  handled (Express 4): the request hangs and Node reports an unhandled rejection. This is why two admin unit tests time out
  on a checkout without `dist`.
- PoC test: `test/unit/admin.unit.test.js` "does not serve files outside the served folders through /fonts or /js"
  (currently failing at the baseline).

### SEC-24 Resource lock leak
- `lib/helpers.js:111-126`: `checkResourceLimits` swallows an error from `list()` without calling `context.error`; the
  request never ends and the lock taken by `lockResource` is never released, blocking every later write on the resource.
- PoC test: `test/unit/locking.unit.test.js` — "releases the lock when the limit check fails".

### SEC-25 Replicated attachment checksum
- `lib/plugins/replicator/replicator.js:26-43`: the md5 digest completes asynchronously after `pAll` has resolved and after
  `downloadList` was consumed, so a changed file is never queued (correctness, integrity of replicas).
- PoC test: `replicator.unit.test.js` — "re-downloads an attachment whose checksum differs".

## Low

- **SEC-26** `authentication/index.js:446-452`: unknown user returns before any hashing (timing enumeration).
- **SEC-27** `admin/index.js:85,101`: `/admin/_groups` (group names and plugins) and `/admin/config` (`blockRetry`,
  `routesToAuth`) answer without authentication. **Confirmed.**
- **SEC-28** `lib/util/uuid.js`: `Math.random()`; ids are not secrets, but attachment ids are the only thing protecting
  `GET /api/:resource/file/:aid` from enumeration when authorization is off for reads.
- **SEC-29** `lib-importFromRemote/api.js:61` (password), `UpdatesManager.js:44` (client supplied data, log injection and
  volume), `logger.info` per cached image hit in `driver/index.js:1096,1148`.
- **SEC-30** `index.js:236-243`: builds a Basic header from `req.session.user.password`; nothing sets `session.user` any
  more.
- **SEC-31** `json_store.js:117` passes the client query object to `db.iterator(query)`, so keys such as `limit`, `reverse`,
  `gte`, `query` are interpreted as iterator options; in `jsondown.js:27` the `lt` bound is inverted. `mongodown` and
  `pgdown` read `options.query`, so a client that sends `{"query": {...}}` reaches the driver filter (the allow-list of
  `sanitizeQuery` still applies, the postgres builder only understands `$and/$or/$regex/$in/$nin`).
- **SEC-32** dependencies: `npm audit` reports 0. Old majors: `helmet 4.6` (latest 8), `sift 3.3` (latest 17),
  `mongodb 4.17`, `mkdirp 0.5`, `fs-extra 8`, `commander 2`, `p-all 3`, `express 4.22` (5 is out). `basic-auth-connect` has not
  been released since 2014.

## Areas reviewed, nothing further found

- SQL: `pgdown.js` uses positional parameters for values; the JSON key is inlined with quote doubling (safe with the default
  `standard_conforming_strings`). Table and index names are derived from the resource name; resource names come from
  `resources/` files and, through SEC-01 only, from the network.
- Deserialisation: `msgpack-stream` (peer data) and `JSON.parse` (records, `cropOptions`, spreadsheet cells) never evaluate
  code; `sift` `$where` is blocked by `sanitizeQuery`; `require()` is used only on the resources folder and the config path.
- `spawn` in `SyslogManager` runs a command taken from the configuration file, not from a request.
- `lib/util/fileType.js` is used on images only; other content types come from the file name (SEC-05).
- SSRF: `sync` and `replicator` fetch URLs from administrator configuration (`_sync` resource, `replication.peers`); only
  `importFromRemote` follows URLs found in remote data (SEC-13, and `sync/index.js:546` `fetch(attach.url)` for the
  attachment list of a configured remote).

## Performance observations (input for phase 5, measured there)

- `JsonStore.read/find` load every record and parse it; `filterResults` runs sift over the full list, then slices for
  paging. `find({field: value})` (unique key checks on every create/update) is a full scan.
- `getDependencyItems` lists every related resource for each `list/find/create`.
- `getImportMap` and `checkUniqueFields` loop `find`/`list` per item.
- `jsondown._persist` rewrites the whole file (twice) after each 50 ms debounce.
- xlsx export: one `list()` per column; import loads the workbook in memory.
- `driver/index.js` uses `fs.existsSync` on the request path for resize caches; image work has no concurrency limit.
- `logger.info` on every cache hit and miss.

## Baseline of the gates (before any change)

| Gate | Result |
|---|---|
| `npm run test:unit` | 346 passing, 1 pending, **2 failing** (`admin plugin` fonts route + its `after all` hook, SEC-23) |
| `npm test` (legacy, `TEST_PORT=19990`) | 58 passing |
| `npx eslint lib index.js test/unit test/security` | **20 errors**, all in tests (quotes, unused vars, `setImmediate` global) |
| `npx knip` | 2 unlisted dependencies and 1 configuration hint, all from `src/` and `knip.config.js` (frontend, out of scope) |
| `npm audit` | 0 vulnerabilities |

# Appendix A: results of the fixes

Every finding has a regression test written **before** the fix and run against the unfixed code. "Before" is the first
assertion that failed on the old code; the run counts are the whole new file (`before` is the same test file against the
code of the previous phase, `after` the same file after the fix).

| Phase | Test file(s) | Before | After |
|---|---|---|---|
| 2 | `test/security/auth.security.test.js` | 13 passing, 30 failing | 43 passing |
| 3 | `test/security/http.security.test.js`, `uploads.security.test.js`, `importFromRemote.security.test.js`, `test/unit/hardening.unit.test.js` | 11 passing, 29 failing | 124 passing |
| 4 | `test/security/replication.security.test.js`, `websocket.security.test.js`, `test/unit/cleanAttachment.unit.test.js`, `replicator.unit.test.js` | 18, 8, 4 and 1 failing | all passing |
| 5 | `paging`, `queryNeedles`, `importMap`, `authentication.cache`, `jsondown` unit tests | see the benchmark | all passing |
| 6 | `test/unit/drivers.contract.test.js` | 4 failing on the json store (found by the suite, see SEC-33..SEC-36) | 60 passing per engine (json store and PostgreSQL) |

## Findings and their tests

| Id | Severity | Fixed in | Test (file, name) | Before (first failing assertion) |
|---|---|---|---|---|
| SEC-01 | critical | `lib/plugins/replicator/protocol.js`, `replicator.js` | `replication.security` "handshake with a shared secret", "a peer that names a resource" | `TypeError: Cannot read properties of undefined (reading 'closeAll')`, folders created outside the data directory |
| SEC-02 | critical | `lib/util/safeRegex.js`, `sanitizeQuery.js` | `query.security` "catastrophic regular expressions", over REST: "answers 400 at once instead of blocking the server" | the event loop blocked for tens of seconds (46 s for 31 characters) |
| SEC-03 | critical | `authentication/index.js` (`localAdmin`) | `auth.security` "is not created when the hardened profile is on" | `expected { username: 'localAdmin', … } to equal undefined` |
| SEC-04 | critical | `lib/util/secrets.js` | `auth.security` "refuses to boot in production with the published default secrets" | `the constructor must throw: expected undefined to be an error` |
| SEC-05 | high | `lib/util/attachmentHeaders.js` | `uploads.security` "sends a script bearing document as a download with a sandbox policy" | `expected undefined to match /^attachment/` |
| SEC-06 | high | `lib/util/passwords.js` | `auth.security` "stores new passwords with scrypt in a versioned format" | `expected 'f3a83b72…' to match /^\$scrypt\$v=1\$N=\d+,r=\d+,p=\d+/` |
| SEC-07 | high | `authentication/index.js`, `lib/util/redact.js` | `auth.security` "puts neither the hash nor the salt in the JWT or in the login response" | hash and salt in the token payload |
| SEC-08 | high | `lib/util/loginLimiter.js` | `auth.security` "login rate limiting" (6 tests) | an object as user name skipped the lock; `expected 200 …` instead of 429 |
| SEC-09 | high | `index.js`, `securityOptions.js` | `auth.security` "sets HttpOnly and SameSite on the JWT and session cookies" | `JWT cookie: expected 'nodeCmsJwt=…' to match /HttpOnly/` |
| SEC-10 | high | `lib/util/csrf.js` | `auth.security` "csrf" (3 tests) | a foreign-origin POST and GET were accepted |
| SEC-11 | high | `lib/UpdatesManager.js` | `websocket.security` "hardened profile" (5 tests) | a client without login was accepted; `Timeout of 4000ms exceeded` |
| SEC-12 | high | `lib/util/uploads.js` | `uploads.security` "temporary files", "limits" | temporary files left behind; no `413` |
| SEC-13 | high | `lib-importFromRemote/*`, `plugins/importFromRemote` | `importFromRemote.security` (4 tests) | `expected 'nodeCmsJwt=a-jwt-token' to equal undefined`; `to have a length of 1 but got 10` |
| SEC-14 | high | `lib/db/leveldown/jsondown.js` | `jsondown.unit` "keeps a file it cannot read aside instead of overwriting it", "writes the file once per flush, through a temporary file that is renamed over it" | a truncated file replaced by an empty database |
| SEC-15 | high | `lib/plugins/replicator/validate.js` | `replication.security` "records sent by an authenticated peer" (8 tests) | `expected '{"_id":…"ti…' to not include 'hacked'` |
| SEC-16 | medium | `lib/util/session.js`, `tokenRevocation.js` | `auth.security` "issues a new session id on login", "rejects the token after logout" | `header replay: expected 'localAdmin' to equal undefined` |
| SEC-17 | medium | `admin/index.js`, `lib/util/redact.js` | `auth.security` "redacts secrets in GET /admin/cms-config" | secrets in the response |
| SEC-18 | medium | `lib/util/securityHeaders.js` | `http.security` "sends a Content-Security-Policy …" | `/admin/config CSP: expected undefined to be a string` |
| SEC-19 | medium | `rest/sendError.js`, `index.js` | `http.security` "error responses" | stack trace in the body |
| SEC-20 | medium | `rest/routes.js` | `uploads.security` "attachment metadata … cannot be rewritten through PUT" | content type and size overwritten |
| SEC-21 | medium | `lib/util/sseCors.js` | `http.security` "does not answer with a wildcard origin" | `/api/system: expected '*' to equal undefined` |
| SEC-22 | medium | `plugins/xlsx/index.js` | `hardening.unit` "xlsx export … does not leave the generated file behind" | the file stayed in the temp folder (the one-list-per-column change showed no gain in the benchmark and was not kept) |
| SEC-23 | medium | `admin/index.js` (`onGetFonts`) | `admin.unit` "does not serve files outside the served folders through /fonts or /js" | `Timeout of 4000ms exceeded` |
| SEC-24 | medium | `lib/helpers.js` | `hardening.unit` "checkResourceLimits" | `expected undefined to equal Error: database is down` |
| SEC-25 | medium | `replicator/attachments.js` | `replicator.attachments.unit` "downloads again an attachment whose checksum differs" | a changed attachment was never fetched again |
| SEC-26 | low | `authentication/index.js` (`burn`) | `auth.security` "answers 429 with Retry-After and the same message for an existing and an unknown account"; the timing itself is not asserted (a timing test would be flaky) | unknown account answered without hashing (read from the code) |
| SEC-27 | low | `admin/index.js` | `auth.security` "requires a login for /admin/_groups" | `expected 200 to be one of [ 401, 403 ]` |
| SEC-28 | low | `lib/util/uuid.js` | `hardening.unit` "ids: do not use Math.random" | `Math.random must not be used for ids` |
| SEC-29 | low | `lib-importFromRemote/api.js`, `UpdatesManager.js` | `importFromRemote.security` "does not write the password to the log when it logs in" | password in the log |
| SEC-30 | low | `index.js` | reading; dead code removed | – |
| SEC-31 | low | `lib/db/json_store.js` | `jsondown.unit` "honours gt, gte, lt and lte"; `stores.unit` | client keys read as iterator options; `lt` inverted |
| SEC-32 | low | none | – | `npm audit`: 0 vulnerabilities; no dependency was changed |

### Found while implementing

| Id | Severity | Fixed in | Test | Before |
|---|---|---|---|---|
| SEC-33 | high | `lib/db/leveldown/sync.js`, `lib/plugins/replicator/replicator.js` | `replication.security` "two nodes: replicate a record from one node to the other" | `TypeError: Cannot read properties of undefined (reading 'mid')`: outbound replication did not work with the current store library (`start/end` options, callbacks, hooks run twice) |
| SEC-34 | medium | `lib/util/driver/index.js` | `drivers.contract` "answers an unsupported operator with an error instead of hanging" | a `$type` query (sift needs a constructor) ended in an unhandled rejection and the request never answered (pending for ever) |
| SEC-35 | medium | `lib/util/driver/index.js` (`_existsImpl`) | `drivers.contract` "removes a record, and finds nothing when it is not there" | `expected true to equal false`: `exists(id)` was `true` for every id |
| SEC-36 | low | `lib/resource.js` (`getImportMap`) | `importMap.unit`, `drivers.contract` "import map" | a query with `$in` matched nothing (it was read by `_.filter` as a plain object): `expected [] to deep equal ['a']` |
| SEC-37 | low | `lib/db/postgres/pgdown.js`, `lib/db/mongo/mongodown.js` | `drivers.contract` (teardown) | connections never released; `terminating connection due to administrator command` was an uncaught error that ended the process |
| SEC-38 | low | `lib/resource.js`, `plugins/replicator/index.js` | `drivers.contract` | every write to a typed resource without peers logged an error with a stack trace |

# Appendix B: performance results (phase 5)

Node 22, 4 cores, seeded data (`mulberry32`), both runs made with the same harness on the same machine, one after the other.
"Before" is the code of the previous commit with the current `test/bench`; times are milliseconds unless the name says
`req_per_s`. A rerun of the 10k write group three times showed the differences in `create_plain`, `update_unique` and
`remove` at 10 000 records to be noise.

| Scenario (100 000 records) | Before | After | Better by |
|---|---:|---:|---:|
| `list_page` (`limit=50`) | 50.9 | 0.93 | 55x |
| `read_first_50` | 45.2 | 0.28 | 161x |
| `find_unique` (`{sku: ...}`) | 1323.6 | 176.1 | 7.5x |
| `filter_eq` | 1393.2 | 193.4 | 7.2x |
| `filter_in` | 1553.9 | 337.9 | 4.6x |
| `filter_regex` | 1589.6 | 525.5 | 3x |
| `filter_range` | 1214.7 | 670.4 | 1.8x |
| `filter_paged` | 1280.4 | 188.4 | 6.8x |
| `create_unique` (unique key check) | 1257.6 | 173.1 | 7.3x |
| `import_map_2000` | 3726.7 | 1321.7 | 2.8x |
| `flush` | 1870 | 1638 | 1.1x |
| event loop stall during a burst of 300 creates (max) | 104 | 19 | 5.5x |
| REST `GET /api/products?limit=50` (req/s) | 0.8 | 154.9 | 194x |
| REST `GET /api/products?query=<unique>` (req/s) | 0.8 | 6.1 | 7.6x |
| REST `GET /api/products/:id` (req/s) | 296 | 468 | 1.6x |
| Basic authentication with scrypt (req/s) | 27 | 453 | 17x |
| boot | 65 | 20 | 3.3x |
| `update_unique` / `remove` (per operation) | 0.068 / 0.030 | 0.34 / 0.13 | 0.2x / 0.2x (slower) |

At 10 000 records the same picture holds: `find_unique` 122 to 12 ms, `filter_eq` 114 to 16 ms, `create_unique` 123 to 12 ms,
`read_first_50` 4.9 to 0.33 ms, `import_map_2000` 410 to 179 ms.

What did **not** get better, and why it stayed in or out:

- `update_unique` and `remove` at 100 000 records cost about 0.1 to 0.3 ms more per operation. The store keeps its keys in
  sorted arrays so that ranges and paging work (they did not before: SEC-31), and keeping an array of 100 000 keys sorted
  costs a `splice`. Both stay far below a millisecond. Kept: the paging numbers above depend on it.
- Image operations: the concurrency limit does not change the time (`resize_8_parallel` 388 to 478 ms before, 411 to 455 ms
  after, three runs each). It bounds the memory of a burst (24 parallel resizes: 209 to 223 MB peak before, 25 to 145 MB after),
  which is why it stays; it is a protection more than a speed-up.
- xlsx export: reading each related sheet once instead of once per column gave no measurable change (2.7 to 2.9 s before,
  2.5 to 3.3 s after, at 10 000 records), so the change was **not** kept.
- Replacing the synchronous `fs` calls on the image request path: no measurable difference, not committed.
- `logger.info` to `debug` on cache hits: not changed (the attachment scenario, 274 req/s before and 311 after, is within the
  noise of a run and the change was not benchmarked on its own).
