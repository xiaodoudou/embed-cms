← [Documentation](../README.md)

# Import and export

Three tools move content into embed-cms in bulk. Pick by where the content lives today:

| The content is in | Use | Turned on by |
|---|---|---|
| a Google Sheet, or an Excel file shaped like one | the **import** plugin (Cms Import page) | an `import` block |
| an Excel file you exported from the CMS, edited, and want back | the **xlsx** plugin | `"xlsx": true` |
| another embed-cms | **import from remote** | an `importFromRemote` block |

All of them match records by the resource's `unique` fields: a row whose unique value already exists updates that record, a new value creates one. A resource without a `unique` field can't be imported reliably, so declare one first.

## Spreadsheets: the import plugin

The workbook has **one sheet per resource, named after the resource**. The first row holds field names, every other row is a record:

| slug | title.enUS | title.zhCN | published |
|---|---|---|---|
| hello | Hello | 你好 | TRUE |
| harbour | The harbour | 港口 | FALSE |

Localised values take a column per locale (`title.enUS`); nested fields use the dotted name. Rows with an empty unique field are skipped. A sheet whose cell A1 says `transpose` is read with rows and columns swapped. A `select` that points to another resource takes the related record's unique value, not its id.

```json
{
  "import": {
    "gsheetId": "the-id-in-the-sheet-url",
    "oauth": { "email": "importer@your-project.iam.gserviceaccount.com", "keyFile": "./importer.pem" },
    "resources": ["authors", "articles"],
    "createOnly": false
  }
}
```

| Option | What it does |
|---|---|
| `resources` | The resources to import, in order: put the targets of relations first. |
| `gsheetId` | The id of the Google Sheet. Not needed if you only upload Excel files. |
| `oauth.email`, `oauth.keyFile` | A Google service account and its private key file. Share the sheet with that address. |
| `createOnly` | Only create records; leave existing ones alone. |

The **Cms Import** page of the admin then shows what an import would change, and runs it, either from the Google Sheet or from an uploaded `.xlsx` with the same sheets. Behind it: `GET /import/status` and `GET /import/execute` for the Google Sheet, `POST /import/statusXlsx` and `POST /import/executeXlsx` (multipart field `xlsx`) for a file; without the file they answer `400` (`missing xlsx file`). The routes need a login.

The downloaded sheets are cached under the system's temporary folder (`embed-cms/import`) and fetched again when the sheet has changed.

### From the command line

`cms-import` does the same from a terminal, against a running CMS, with a configuration file that adds where that CMS is:

```json
{
  "host": "localhost:9990",
  "prefix": "",
  "gsheetId": "the-id-in-the-sheet-url",
  "oauth": { "email": "importer@your-project.iam.gserviceaccount.com", "keyFile": "./importer.pem" },
  "resources": ["authors", "articles"]
}
```

```sh
cms-import ./import.json localAdmin:password      # shows what would change, then asks
cms-import ./import.json localAdmin:password -y   # no question
```

| Option | What it does |
|---|---|
| `-y`, `--yes` | Don't ask for confirmation. |
| `-s`, `--skip` | Use the sheets downloaded by the previous run instead of downloading them again. |
| `-c`, `--createFolders` | Only create the local folders for the attachments (resource/key/field); import nothing. |
| `-o`, `--createOnly` | Only create records; leave existing ones alone. |

The command logs in with the user and password you give it (Basic authentication, and the login page when the CMS uses JWT), so that user's group needs the rights to create and update the imported resources. `prefix` is the path the CMS is mounted under; leave it out when it is mounted at the root.

## Excel round trip: the xlsx plugin

With `"xlsx": true`, every resource can be exported to a workbook and imported back. The routes need a token, set in the admin under **Spreadsheet settings** (CMS group):

| Route | What it does |
|---|---|
| `GET /xlsx/:resource?token=…` | Download the resource as an `.xlsx`. Accepts `query` like the REST API. |
| `POST /xlsx/:resource/status?token=…` | Upload a workbook (multipart field `xlsx`) and see what would change. `checkRequired=true` also reports empty required fields. |
| `POST /xlsx/:resource/import?token=…` | Apply it. Records are created and updated, never deleted. `detail=true` returns the full change list. |

```sh
curl -o articles.xlsx 'http://localhost:9990/xlsx/articles?token=…'
# edit in Excel, then
curl -F xlsx=@articles.xlsx 'http://localhost:9990/xlsx/articles/import?token=…'
```

A token in a URL ends up in browser history and proxy logs. Use a long one, and change it if a link leaks.

## Copying from another embed-cms: import from remote

Import from remote logs in to two CMS servers over REST and copies the records and files of chosen resources from the remote to the local one. It is meant for one-off migrations, such as seeding a new server from an old one.

```json
{
  "local":  { "protocol": "http://",  "host": "localhost:9990",  "prefix": "",     "username": "localAdmin", "password": "…" },
  "remote": { "protocol": "https://", "host": "cms.example.com", "prefix": "/cms", "username": "reader",     "password": "…" },
  "resources": ["authors", "articles"]
}
```

Run it from a terminal, with the configuration in a file:

```sh
cms-import-remote ./import-remote.json            # asks for confirmation
cms-import-remote ./import-remote.json -y --overwrite
```

| Option | What it does |
|---|---|
| `-y`, `--yes` | Don't ask for confirmation. |
| `--overwrite` | Replace every local record with the remote one. |
| `--use-cache` | Reuse the data downloaded by the previous run. |
| `--convert-to-preload` | Also write the downloaded data in preload format. |

`prefix` is the path each CMS is mounted under; leave it out for the root. `docs/examples/importFromRemote-example.json` is a complete example.

The same configuration can go under `importFromRemote` in `cms.json`, which adds `GET /importFromRemote/status` and `GET /importFromRemote/execute`. `execute` answers `{ "status": "started" }` at once and imports in the background (a second call while one runs answers `409`); `status` follows it, from `starting` to `done`, or `error` with the reason. There is no admin page for it. Files are only downloaded from the remote's own host (and `remote.allowedHosts`), so a tampered remote can't make your server fetch other addresses.
