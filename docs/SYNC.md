# Sync

The sync plugin copies the records of chosen resources from one node-cms to another, on demand. The typical case is
staging and production: editors prepare content on staging, check it, and then push it to production in one go.

Sync is simpler than [replication](REPLICATION.md). It talks plain HTTP, matches records by their `unique` fields
rather than by id, and makes the target look like the source: records that exist only on the target are removed.
Use replication for a fleet that stays in step continuously; use sync for occasional, deliberate copies.

## Turning it on

Give the configuration a `sync` block with the resources that may be synced:

```json
{
  "sync": { "resources": ["articles", "authors"] }
}
```

Any `sync` block turns the plugin on, even an empty one (`{}`). To turn it off, leave the block out or set it to `null`.
`sync.disablePlugin: true` keeps the routes but hides the admin page.

## Pairing two servers

The rest of the setup happens in the admin, in **Sync settings** (CMS group), on both servers. It holds:

| Setting | What to put there |
|---|---|
| What the other CMS may do here | `read` to let the other server read the synced resources, `write` to let it change them. |
| This CMS: token | A long random secret. The other server must send it to sync with this one; without it, sync is refused. |
| This CMS: address | How the other server reaches this one, e.g. `https://staging.example.com`. |
| Other CMS: token | The other server's own token. |
| Other CMS: address | The other server's address, e.g. `https://production.example.com`. |
| Resources to sync | A subset of `sync.resources`. |

For the staging-to-production case: on staging, allow `read`; on production, allow `write`. Each side gets the
other's token and address.

## What a sync does

```mermaid
sequenceDiagram
  participant Ed as Editor
  participant St as Staging
  participant Pr as Production
  Ed->>St: GET /sync/articles/from/local/to/remote?token=staging-token
  St->>St: export articles (unique keys, no internal fields)
  St->>Pr: PUT /sync/articles?token=production-token
  Pr-->>St: accepted, runs in the background
  St-->>Ed: started
  Pr->>Pr: create and update by unique keys, delete the rest
  Pr->>St: GET /sync/articles/:id/attachments/:aid (files that differ)
```

For each resource, the source exports its records with the internal fields removed, relations turned into the
`unique` values of the related records, and attachments as download links. The target then:

- creates records it doesn't have and updates those it has, matching them by their **`unique` fields**;
- **deletes its records that are not in the export**;
- downloads attachments whose files differ.

The work runs in the background; the request answers at once.

Because records are matched by their `unique` fields, every synced resource needs at least one, and so does every
resource a synced `select` or `multiselect` points to.

## Routes

Every route under `/sync` checks the token in `?token=` (or a `token` field of the body) against **This CMS: token**:

| Route | What it does |
|---|---|
| `GET /sync/:resource` | Export the records (needs `read`). |
| `PUT /sync/:resource` | Make this server's records match the array in the body (needs `write`). |
| `GET /sync/:resource/status` | Progress of the last sync. |
| `GET` or `POST /sync/:resource/from/local/to/remote` | Read here, write there; `from/remote/to/local` does the reverse. |
| `GET /sync/:resource/:id/attachments/:aid` | A file, for the other server to download. |

`GET /sync/local/:resource` and `GET /sync/remote/:resource` read through the stored settings and currently need no token
([BUGS.md](BUGS.md#plugins)).

## What can go wrong

- **`401 token is not match`.** The tokens are crossed: "Other CMS: token" on one side must equal "This CMS: token" on
  the other.
- **The Deploy button of the Sync page fails.** It sends no token, so it is refused today
  ([UI_BUGS.md](UI_BUGS.md#plugin-pages)). Call the `from/…/to/…` route with `?token=` instead.
- **Records vanished on the target.** That is what a sync does with records the source doesn't have. Sync the other way
  first, or keep target-only records in a resource that isn't synced.
- **Duplicates instead of updates.** The resource has no `unique` field, or its values differ between the two servers.
- **Changes don't sync on their own.** The automatic push after a change is broken
  ([BUGS.md](BUGS.md#plugins)); sync by hand.
- **The server stopped during a sync.** A failed sync can end the process with the stock `server.js`
  ([BUGS.md](BUGS.md#plugins)). Run the CMS under a supervisor.
