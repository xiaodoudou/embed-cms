# Security

This document describes what the backend protects, the options that control it, a hardening checklist for a
deployment, how to report a vulnerability, and the changelog of the hardening work (every option added and its default).

The backend audit that led to these changes, with a proof of concept for each finding, is in
[docs/BACKEND_AUDIT.md](docs/BACKEND_AUDIT.md).

## Reporting a vulnerability

Please do not open a public issue for a security problem.

- Send the details privately to the maintainers of the repository (open a *private security advisory* on the repository,
  or write to the address of the maintainer given in `package.json`).
- Say which version or commit you tested, what you did, what you saw, and what you expected. A failing request or a short
  script is the best report.
- You will get an answer within a few working days. Fixes are released with an entry in the changelog below, and the
  reporter is credited if they wish.

Supported versions: the latest release and the branch it was made from. Fixes are not backported.

## The security profile

Every protection that could change what an existing deployment sees is switched by one setting, `security.profile`:

| Profile | Chosen when | What it means |
|---|---|---|
| `legacy` | `NODE_ENV` is not `production` | The behaviour of earlier releases, except for the defects listed under *Always on* |
| `hardened` | `NODE_ENV=production` | Every protection below is on |

`security.profile` in `cms.json` picks a profile explicitly (`"hardened"` on a staging server to try it, `"legacy"` on a
production server to keep the old behaviour until the deployment is ready). Any single setting can be overridden by its own
key. Nothing is decided silently: with the `legacy` profile the code path of earlier releases runs.

```json
{
  "security": {
    "profile": "hardened",
    "csrf": "origin",
    "allowedOrigins": ["https://admin.example.com"],
    "localAdmin": false
  },
  "trustProxy": 1
}
```

### Settings

| Setting | `legacy` | `hardened` | Effect |
|---|---|---|---|
| `strongSecrets` | `false` | `true` | Boot is refused when `auth.secret` or `session.secret` is missing, shorter than 16 characters or one of the values published in the source |
| `generateSecrets` | `false` | `false` | With `strongSecrets`: generate the missing secrets once and keep them in `<data>/.secrets.json` (mode 0600) instead of refusing to boot |
| `localAdmin` | `true` | `false` | Create the built-in `localAdmin` account. When off, an existing `localAdmin` record cannot log in with the password `localAdmin`. Whatever the setting, a boot log line reports an existing `localAdmin` record: an error when it still has the default password, a warning otherwise |
| `passwordHash` | `legacy` | `scrypt` | Scheme for new and changed passwords: `legacy` (PBKDF2-SHA1, 100 rounds) or `scrypt` (N=2^15, r=8, p=1, versioned). Both formats always verify; a legacy hash is rewritten as scrypt at the next successful login when `scrypt` is selected |
| `hideCredentials` | `false` | `true` | No password hash or salt in the JWT, the login response or `find()` results; tokens carry a fingerprint that notices a password change |
| `genericLockout` | `false` | `true` | A locked account answers `429` with `Retry-After` and one message for every account |
| `blockRetry` (top level) | off | `{ "retry": 10, "duration": 5 }` | Failed logins tolerated per account and address, and the lock duration in minutes. `false` turns it off |
| `csrf` | `off` | `origin` | Cookie authenticated writes, and the routes that change state on `GET`, are refused when Origin, Referer or Fetch Metadata says they come from another site |
| `allowedOrigins` | `[]` | `[]` | Origins (`https://host`) that count as the same site for `csrf` and for the update websocket |
| `cookies` | `httpOnly: false, sameSite: false, secure: false` | `httpOnly: true, sameSite: "lax", secure: "auto"` | Attributes of the JWT and session cookies. `secure: "auto"` needs `trustProxy` behind a TLS proxy |
| `strictSessions` | `false` | `true` | No session is created for anonymous and Basic authenticated requests (`resave` and `saveUninitialized` are forced to `false`) |
| `redactConfig` | `false` | `true` | `/admin/config` no longer carries the settings of `import`, `importFromRemote`, `sync`; `/admin/cms-config` masks secrets and keeps them when the placeholder is saved back |
| `strictAdmin` | `false` | `true` | `/admin/_groups` needs a login, theme names are validated |
| `headers` | `false` | `true` | Response headers from `lib/util/securityHeaders.js` (CSP, nosniff, frame options, Referrer-Policy, Permissions-Policy, COOP, HSTS over https, no `X-Powered-By`) instead of the historic helmet set |
| `contentSecurityPolicy` | (default policy) | (default policy) | A policy string, or `false` for none |
| `sseCors` | `"*"` | `[]` | Origins that may read `/api/system` and `/api/_syslog`; `[]` means the same origin only |
| `safeRegex` | `false` | `true` | Queries with a regular expression that can backtrack catastrophically (nested repetitions, repeated alternatives, back references, more than 3 unbounded repetitions) are refused with 400 |
| `uniformErrors` | `false` | `true` | Every error that no plugin answered ends as a json body without stack trace or path |
| `safeAttachments` | `false` | `true` | HTML, SVG, XML, script and unknown attachments are sent as downloads with a sandbox policy; PUT can only change `_name`, `cropOptions`, `order`, `_payload`, `_fields`, `_filename` |
| `inlineTypes` | `[]` | `[]` | Extra content types that may be shown inline with `safeAttachments` |
| `strictUploads` | `false` | `true` | File names are sanitised, the type of an upload is taken from its content, default upload limits apply |
| `limits.json` | `"100kb"` | `"100kb"` | Size of a JSON request body. This is what every route accepted before the option existed (the larger limits declared by some plugins never took effect) |
| `limits.upload` | none | `{ fileSize: "256mb", files: 20, fields: 200, fieldSize: "1mb", parts: 260 }` | Limits of multipart uploads; a value given here also applies to the `legacy` profile |
| `restrictRemoteUrls` | `false` | `true` | `importFromRemote` only fetches attachments from the remote it imports from (and `allowedHosts` of its `remote` block) |
| `strictReplication` | `false` | `true` | The replication port needs `replication.secret`, peers may only ask for resources this node has, changes from a peer are validated |
| `wsAuth` | `false` | `true` | The record update websocket needs a login and a same-origin (or listed) page |
| `wsMaxPayload` | library default (100 MiB) | `16384` | Largest message a websocket client may send |
| `authCacheTtl` | `60000` | `60000` | Milliseconds a verified password stays verified in memory (Basic authentication runs the hash once per minute, not per request); `0` turns it off |

### Other options added

| Option | Default | Effect |
|---|---|---|
| `trustProxy` | not set | Passed to Express `trust proxy`: `req.ip`, `req.secure` and the login lockout follow the proxy chain. Set it to the number of proxies in front of the CMS; without it the address of the TCP peer is used |
| `imageConcurrency` | no limit (`legacy`), number of cores (`hardened`) | Image operations (resize, crop, smart crop) that run at once; the others wait. `0` means no limit. With the `hardened` profile at most 100 may wait, the next request gets 503 |
| `attachmentCleanupGrace` | `300000` | Milliseconds a file must have been idle before `cleanAttachment` may remove it as an orphan |
| `replication.secret` | not set | Shared secret of the replication port. Both sides prove they know it with an HMAC-SHA256 challenge before any resource is named |
| `replication.strictTypes` | `false` | Read the type (`normal`, `upstream`, `downstream`) of a resource from its options, so the direction rules of `replication.peers` apply. Off, every resource counts as `normal`, as in earlier releases |
| `replication.settleDelay` | `2000` | Milliseconds `replicate()` waits for a peer to flush before it syncs attachments |
| `replication.maxRecordBytes` | `4194304` | Largest record accepted from a peer with `strictReplication` |
| `importFromRemote.remote.restrictUrls` / `.allowedHosts` | `false` / `[]` | Per remote, in addition to `restrictRemoteUrls` |

`replication.strictTypes` is worth a word. The replication manager used to look for the type on the resource object, where
it does not exist, so every resource was treated as `normal` and the `direction` of a peer never mattered. With the option
on, a `downstream` resource (`_users`, `_groups`, `_settings` and the resources you declared so) is only synced with peers
whose `direction` is `upstream` or `normal`, and an `upstream` resource with peers of direction `downstream` or `normal`.
A peer without `direction` then stops syncing typed resources. Give every peer a direction before turning it on.

### Always on

These are defects, not policy; they are fixed in every profile:

- a `page` without a `query` returned the first page; `page` is honoured, and the REST `numRecords` header is computed
  without reading every record twice;
- filtered reads of `_users` returned `password` and `salt` (a filtered read skipped the hooks after it);
- `GET /admin/changeTheme/...` stored a hash of the stored hash and locked the user out;
- a user name that is not a string can no longer be used as a query to log in, and the login lockout counts it;
- login for an unknown account takes as long as for a known one (timing);
- the session id is replaced at login, logout destroys the session and revokes the token (the list of revoked tokens
  survives a restart, `<data>/.revoked-tokens.json`), a changed password ends the sessions and tokens of that user;
- uploaded temporary files are removed after the request and kept in a private folder; xlsx exports use a private file
  that is deleted after sending;
- a replication peer can no longer make the node create folders outside its data directory, an error event on a socket
  or a websocket no longer ends the process, a malformed frame no longer crashes the sync;
- the json file store keeps a file it cannot parse aside (`db.json.corrupt-<time>`) instead of overwriting it, and writes
  through a temporary file that is renamed;
- outbound replication and the sync of the json store work again (they did not run with the current store library);
- `cleanAttachment` answers, and removes only orphans older than `attachmentCleanupGrace`;
- record ids of one process sort in the order they were made, and use a cryptographic random source;
- `importFromRemote` downloads a file once, no longer logs the password, and sends the credentials only to the remote;
- an error or a rejected promise inside a driver method (a query with `$type`, for instance) ends the call with that error;
  it used to leave the call pending forever, and `$type` in a query answers `400` because a JSON query cannot express it;
- `exists(id)` answers `false` for a record that is not there (it answered `true` for every id);
- the query of `getImportMap` (used by the import) understands `$in`, `$gt` and the other operators, and is validated like
  any other client query;
- the PostgreSQL and MongoDB stores release their connections when the CMS closes, and a dropped idle PostgreSQL connection
  no longer ends the process;
- a write to a resource with no replication peer no longer logs an error with a stack trace.

## Recommended production configuration

This is the `cms.json` that follows the decisions taken for this deployment, setting every choice explicitly instead of
relying on the profile (the profile only fills in what is not written here). `test/unit/securityConfig.unit.test.js` reads
the block below, so option names and values in it are checked against the code. Replace the three `REPLACE_WITH_*` values
with random strings of at least 32 characters (they belong in a secret store, never in version control), and put your own
peers in `replication`.

<!-- example-config:start -->
```json
{
  "auth": { "secret": "REPLACE_WITH_RANDOM_AUTH_SECRET" },
  "session": { "secret": "REPLACE_WITH_RANDOM_SESSION_SECRET" },
  "trustProxy": 1,
  "blockRetry": { "retry": 10, "duration": 5 },
  "attachmentCleanupGrace": 300000,
  "replication": {
    "secret": "REPLACE_WITH_RANDOM_REPLICATION_SECRET",
    "strictTypes": true
  },
  "security": {
    "strongSecrets": true,
    "localAdmin": true,
    "passwordHash": "scrypt",
    "hideCredentials": true,
    "genericLockout": true,
    "csrf": "origin",
    "allowedOrigins": [],
    "cookies": { "httpOnly": true, "sameSite": "lax", "secure": "auto" },
    "strictSessions": true,
    "redactConfig": true,
    "strictAdmin": true,
    "headers": true,
    "sseCors": [],
    "safeRegex": true,
    "uniformErrors": true,
    "safeAttachments": false,
    "strictUploads": false,
    "restrictRemoteUrls": true,
    "strictReplication": true,
    "wsAuth": true,
    "wsMaxPayload": 16384,
    "authCacheTtl": 60000,
    "limits": { "json": "100kb" }
  }
}
```
<!-- example-config:end -->

What each deviation from the `hardened` profile means, and what still needs a decision:

| Setting | Value here | Note |
|---|---|---|
| `localAdmin` | `true` | The profile would turn it off. The account stays, and every boot logs an error while it has its default password: change that password or delete the account |
| `safeAttachments` | `false` | HTML and SVG attachments display inline and run with the privileges of the site for whoever opens them (accepted risk). Set `true` to send them as downloads |
| `strictUploads` | `false` | No file name sanitising, no content-based type, and **no upload limits** |
| `uniformErrors` | `true` | Not yet confirmed by the owner: JSON errors without stack traces |
| `limits.json` | `"100kb"` | Not yet confirmed: the size of the largest JSON body (a record, an import) decides whether it must be raised |
| `allowedOrigins` | `[]` | Add the origin of the admin app if it is served from another host than the API |
| `trustProxy` | `1` | One reverse proxy in front of the CMS; change it to the real number |
| `replication.strictTypes` | `true` | Every peer needs a `direction`, or it stops syncing `_users`, `_groups` and `_settings` |

Not in the block because it depends on the environment: `imageConcurrency` (unlimited with the `legacy` profile, one per core
with `hardened`), the `importFromRemote` remotes (`restrictUrls`, `allowedHosts` per remote) and the peers list. In
development, run without `NODE_ENV=production` and without this block: the `legacy` profile keeps cookies, headers and the
Content-Security-Policy as they were, so a dev server keeps working (the policy has only been checked against the built admin
app).

## Hardening checklist

Run with `NODE_ENV=production` (the `hardened` profile), then check:

1. **Secrets.** Set `auth.secret` and `session.secret` to random values of at least 32 characters in `cms.json` (or set
   `security.generateSecrets` and back up `<data>/.secrets.json`). Keep the file out of version control.
2. **Accounts.** Log in once with your own administrator and delete `localAdmin` if it exists. Do not set
   `security.localAdmin`.
3. **Password hashes.** Leave `passwordHash` on `scrypt`. If nodes replicate `_users`, upgrade every node first: a node
   that runs an earlier release cannot verify an scrypt hash.
4. **Proxy.** Behind a reverse proxy, set `trustProxy` to the number of proxies, forward `X-Forwarded-Proto`, and serve the
   admin app over https (cookies get `Secure`, HSTS is sent).
5. **CSRF and origins.** If the admin app is served from another origin than the API, list it in `allowedOrigins`.
6. **Replication.** Set the same `replication.secret` on every node, firewall the replication port to the peers, and set a
   `direction` on every peer before turning on `replication.strictTypes`.
7. **Uploads.** Tune `limits.upload` to what your editors need. Do not add `text/html` or `image/svg+xml` to `inlineTypes`
   unless you trust everyone who can upload.
8. **Config editor.** `/admin/cms-config` can rewrite `cms.json` and restarts the process: only members of the `admins`
   group may use it. Keep that group small.
9. **Logs.** `/api/_syslog` shows the log to every user who can log in: keep secrets out of log lines (the backend does not
   write passwords or tokens) and give the `plugins` right of the group only to administrators.
10. **Dependencies.** Run `npm audit --omit=dev` in CI (the workflow does).

## Not covered

- The frontend (`src/`) was not changed by this work. Its own protections (DOMPurify) are separate.
- Transport encryption of the replication port: the shared secret authenticates the peers, it does not encrypt what they
  exchange. Run the replication port on a private network or through a tunnel.
- MongoDB and PostgreSQL servers are configured by their operators; the CMS only guarantees the queries it sends.
- Regular expressions are checked, not sandboxed: a pattern that passes the check can still be slow on a very long text
  field. If that matters to you, keep `limits.json` small and consider a regular expression engine with a linear time
  guarantee in front of the query filter.

## Changelog

### Unreleased (branch `claude/backend-hardening`)

Options added, with defaults (see the tables above for the profile dependent ones):

- `security.profile`, `strongSecrets`, `generateSecrets`, `localAdmin`, `passwordHash`, `hideCredentials`,
  `genericLockout`, `csrf`, `allowedOrigins`, `cookies`, `strictSessions`, `redactConfig`, `strictAdmin`, `headers`,
  `contentSecurityPolicy`, `sseCors`, `safeRegex`, `uniformErrors`, `safeAttachments`, `inlineTypes`, `strictUploads`,
  `restrictRemoteUrls`, `strictReplication`, `wsAuth`, `wsMaxPayload`, `authCacheTtl`, `limits.json`, `limits.upload`
- top level: `trustProxy`, `imageConcurrency`, `attachmentCleanupGrace`; `blockRetry: false` turns the lockout off
- `replication.secret`, `replication.strictTypes`, `replication.settleDelay`, `replication.maxRecordBytes`
- `importFromRemote.remote.restrictUrls`, `importFromRemote.remote.allowedHosts`

Files written by the backend: `<data>/.secrets.json` (only with `generateSecrets`), `<data>/.revoked-tokens.json`,
`<data>/<resource>/json/db.json.corrupt-<time>` (only when a store file could not be read).

Phases, in order (each is one commit on the branch):

1. Audit of the backend (`docs/BACKEND_AUDIT.md`).
2. Authentication and secrets: secret policy, `localAdmin`, scrypt hashes, no credentials in tokens, lockout, cookies,
   sessions, CSRF, configuration editor.
3. HTTP hardening: headers, event stream CORS, regular expression check, error handler, size limits, uploads, attachment
   serving, `importFromRemote`.
4. Replication and sync: authenticated handshake, validation of what a peer sends, websocket authentication, `strictTypes`,
   and the repair of the sync of the json store.
5. Performance: sorted key index and range search in the json store, query prefilter, paging, adaptive and sliced flush,
   indexed import map, one read per export sheet, verified password cache, image concurrency limit.
6. Database drivers: contract suite for the json store, PostgreSQL and MongoDB, and the fixes it found.
7. Cleanup and documentation.
