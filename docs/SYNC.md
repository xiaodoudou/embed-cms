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

A sync also starts on its own: 5 seconds after the last change to a synced resource, this server asks the other one
to pull it (`GET <other address>/sync/:resource/from/remote/to/local`). Changes that arrive through a sync don't trigger
a push back.

A sync sends a whole resource in one JSON body, so the target's `security.limits.json` (100 KB by default) must be
larger than the export of the biggest synced resource; otherwise the target answers `413` with a message naming the
setting. Raise it on the target, to a size you are comfortable accepting from the other server.

Because records are matched by their `unique` fields, every synced resource needs at least one, and so does every
resource a synced `select` or `multiselect` points to.

## Routes

The routes the other server calls check the token in `?token=` (or a `token` field of the body) against **This CMS:
token**:

| Route | What it does |
|---|---|
| `GET /sync/:resource` | Export the records (needs `read`). |
| `PUT /sync/:resource` | Make this server's records match the array in the body (needs `write`). |
| `GET /sync/:resource/status` | Progress of the last sync. |
| `GET` or `POST /sync/:resource/from/local/to/remote` | Read here, write there; `from/remote/to/local` does the reverse. `POST` also accepts a logged-in user of the admin instead of the token: that is what the **Deploy** button of the Sync page uses. |
| `GET /sync/:resource/:id/attachments/:aid` | A file, for the other server to download. |

`GET /sync/local/:resource` and `GET /sync/remote/:resource` (and their `/status`) read through the stored settings, for
the admin's Sync page. They need a logged-in user of the admin, not a token.

A refused read or write answers `403`. A failed sync is logged, and `GET /sync/:resource/status` reports it as `error`
with the reason.

## What can go wrong

- **`401 token is not match`.** The tokens are crossed: "Other CMS: token" on one side must equal "This CMS: token" on
  the other.
- **Records vanished on the target.** That is what a sync does with records the source doesn't have. Sync the other way
  first, or keep target-only records in a resource that isn't synced.
- **Duplicates instead of updates.** The resource has no `unique` field, or its values differ between the two servers.
- **Changes don't sync on their own.** The automatic push asks the other server to pull a resource 5 seconds after the
  last change to it. It only happens when the resource is ticked in **Resources to sync** and **Other CMS: address** is
  set, and only works when the other server's own settings point back at this one.
