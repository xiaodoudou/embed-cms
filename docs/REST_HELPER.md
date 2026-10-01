# RestHelper: the REST middlewares in your own routes

The built-in REST API covers the common case: CRUD on every resource, with rights checked per group. Sometimes you
want an endpoint of your own: a public search that only returns some fields, a response shaped for one client, a route
that combines two resources. `CMS.RestHelper` hands you the middlewares the REST API is built from, so your route
finds the resource, checks the caller's rights and parses the query exactly as `/api` does.

```js
const express = require('express')
const CMS = require('embed-cms')

const cms = new CMS({ mid: 'webnode1' })
const { mw } = new CMS.RestHelper()
const ctx = { cms }            // the middlewares only read ctx.cms

const app = express()
app.use(cms.express())
app.use(express.json())        // authorize reads req.body: parse it first

// GET /search/articles?query={"published":true}&limit=5
app.get('/search/:resource',
  mw.find_resource(ctx),       // 404 for an unknown resource, else req.resource
  mw.authorize(ctx),           // 401 unless the caller's group may read it
  mw.parse_query,              // req.options: query (checked), limit, page and the other parameters
  async (req, res, next) => {
    try {
      const records = await req.resource.read(req.options.query, req.options)
      res.json(records.map(({ _id, title, slug }) => ({ _id, title, slug })))
    } catch (error) {
      next(error)
    }
  }
)

const server = app.listen(3000, () => cms.bootstrap(server))
```

## The middlewares

| Middleware | Use it as | What it does |
|---|---|---|
| `mw.find_resource(ctx)` | a factory | Answers `404` if `:resource` isn't a declared resource; otherwise sets `req.resource`. |
| `mw.authorize(ctx)` | a factory (returns two middlewares) | Identifies the caller (Basic header, or a JWT in `token`, `x-access-token` or the `embedCmsJwt-<mid>` cookie; anonymous otherwise) and checks the right that matches the HTTP method: `GET` read, `POST` create, `PUT` update, `DELETE` remove, and `attachments` for writes to an `/attachments` URL. Answers `401` when the group lacks it. Sets `req.body._updatedBy`. |
| `mw.parse_query` | as is | Parses `?query=` as JSON, refuses operators outside the allowed list, and copies the other query parameters (as strings) into `req.options`. |
| `mw.list_resources(ctx)` | a factory, as a handler | Answers the declaration of every resource (schema, locales and so on, with `title` and `mid`). |

`new CMS.RestHelper().routes` is the module of the built-in route handlers, if you want to reuse one as is.

## Order matters

Use the order the REST API uses: **`find_resource`, then `authorize`, then `parse_query`**.

- `authorize` decides with `req.resource`. Before `find_resource` there is none, and the request is **let through
  without a check**. This is the mistake to avoid.
- `parse_query` applies the `safeRegex` check of the resource's CMS, which it finds through `req.resource`.
- `authorize` reads `req.body.token`. Without a JSON body parser before it, `req.body` is undefined and the request
  fails.

## Reading records in a handler

`req.resource` is the resource itself, not the `cms.api()` wrapper:

| Call | Returns |
|---|---|
| `req.resource.read(query, { page, limit })` | An array, like `GET /api/:resource`. This is what you want for lists. |
| `req.resource.find(idOrQuery)` | One record, or `null`. |

Pages count from 0, there is no sort option, and without `limit` you get every record ([API.md](API.md#querying-and-paging)).

## Without the built-in routes

You can turn off the built-in API and admin and keep only your own routes. The authentication plugin stays on, so
`authorize` still works:

```js
const cms = new CMS({ mid: 'webnode1', disableREST: true, disableAdmin: true })
```

Register your own `/resources` route before a `/:resource` route, or Express will take `resources` for a resource name.

## What can go wrong

- **Every request is allowed.** `authorize` runs before `find_resource`.
- **The request never answers.** No `express.json()` before `authorize`.
- **`Machine id should be an 8 digit string`.** `mid` must be exactly 8 characters.
- **Errors come back as HTML.** `parse_query` answers a refused query with a JSON `400` itself, but an error your own
  handler passes to `next` reaches Express's default handler. Add an error handler of your own, or turn on
  `security.uniformErrors`.
