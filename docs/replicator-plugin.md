# Replicator Plugin (Server Side)

The Replicator plugin enables data and attachment synchronization between multiple node-cms instances. It is designed for distributed deployments where collections and their associated files need to be kept in sync across servers.

---

## What Does the Replicator Plugin Do?

- **Document Replication:**
  - Synchronizes JSON documents (resource data) between a remote and local node-cms instance.
  - Ensures that changes made on one server are reflected on another.
- **Attachment Replication:**
  - Synchronizes file attachments (such as images or documents) associated with resources.
  - Uses efficient streaming and MD5 checksums to avoid redundant transfers.
- **Automated Cleanup:**
  - Cleans up old or orphaned attachments and indexes as part of the sync process.

---

## How to Enable or Disable the Replicator Plugin

The Replicator plugin is enabled automatically if the `netPort` option is set in your CMS configuration. If `netPort` is not set, the plugin is disabled and no replication server will be started.

**To enable:**

```json
{
  "netPort": 9000, // or any available port number
  "mid": "server-1" // unique machine/server identifier
}
```

**To disable:**

- Omit the `netPort` option from your configuration, or set it to `null` or `0`.

---

## Configuration Options

Add these options to your `cms.json` or when initializing the CMS:

| Option    | Type    | Description                                                      |
|-----------|---------|------------------------------------------------------------------|
| netPort   | Number  | Port to listen for replication connections. Enables the plugin.   |
| mid       | String  | Unique machine/server identifier for replication.                 |
| replication.auth | Object | Optional `{ username, password }` sent as HTTP Basic credentials when downloading attachments from a peer. Needed when the peer requires authentication for the resource (attachment downloads are authorized like any other read). |

**Example:**

```js
const CMS = require('./index.js');
const cms = new CMS({
  data: './data',
  locales: ['enUS'],
  netPort: 9000, // Enables replicator
  mid: 'server-1' // Unique ID for this server
});
await cms.bootstrap();
```

---

## How Replication Works

- When `netPort` is set, the server listens on it for incoming document sync connections (TCP).
- Peers are read from `replication.peersByResource[<resource>]`, falling back to `replication.peers`.
  A peer is an object `{ host, port, url, direction }` where `url` is the base HTTP url used to transfer attachments.
- After a record of a resource whose `type` is not `normal` is created or updated, it is synced to the resource's peers.
- Attachments are checked for existence and integrity (MD5 hash) before downloading, and old or removed attachments are cleaned up.
- Attachment downloads are authorized like any other read on the peer. If the peer requires a login, set
  `replication.auth` (see the options table).

### HTTP routes

All routes require a logged in session (they are part of the default `routesToAuth`).

| Route | Description |
|---|---|
| `GET /replicator/resources` | Lists resources with their type, peers and direction |
| `POST /replicator/sync/:resource` | Syncs every record of a resource with its peers |
| `POST /replicator/sync/:resource/:id` | Syncs a single record |

---

## Usage Example

```js
const CMS = require('./index.js');
const cms = new CMS({
  data: './data',
  netPort: 9000,          // enables the sync listener
  mid: 'server-1',
  replication: {
    peersByResource: {
      articles: [{ host: 'target-host', port: 9000, url: 'http://target-host:9990/api/', direction: 'normal' }]
    },
    auth: { username: 'replicator', password: '...' } // only if the peer requires authentication
  }
});
await cms.bootstrap();

// trigger a sync programmatically
await cms.$replicator.syncResource('articles');
await cms.$replicator.syncRecord('articles', 'some-record-id');
```

---

## Notes

- The plugin uses TCP sockets for document sync and HTTP for attachment transfer.
- Ensure that firewalls allow traffic on the configured `netPort`.
- The `mid` (machine ID) should be unique for each server to avoid conflicts.
- For advanced scenarios, you may customize or extend the plugin by editing `lib/plugins/replicator/replicator.js`.

---

## Troubleshooting

- **Replication not starting?**
  - Check that `netPort` is set and not in use by another process.
  - Ensure the `mid` is unique and provided.
- **Attachments not syncing?**
  - Verify that the `baseUrl` is correct and accessible from the source server.
  - Check logs for MD5 mismatch or file access errors.

---

For more details, see the source code in `lib/plugins/replicator/replicator.js`.
