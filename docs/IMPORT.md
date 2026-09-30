## Import

#### Using cms-import command to import gsheet data to cms

1.  share your gsheet to user import-reader@your-project.iam.gserviceaccount.com

1.  create config json file like that, e.g. local.json
```
{
  "host": "localhost:8351",
  "prefix": "/cms",
  "oauth": {
    "email":"import-reader@your-project.iam.gserviceaccount.com",
    "keyFile":"import-reader.pem"
  },
  "gsheetId": "your-google-sheet-id",
  "resources": [
    "users",
    "favoriteColors",
    "musicStyles",
    "hobbies",
    "models",
    "trims",
    "paints",
    "dealerships",
    "locations",
    "users",
    "translations"
  ]
}
```

1.  copy pem key (import-reader.pem) to your folder

1.  install cms-import command
```
    $ npm install -g git+https://github.com/xiaodoudou/node-cms-private.git
```

1.  run cms-import command to import gsheet data to cms
```
    $ cms-import ./local.json <username>:<password> -y
```
