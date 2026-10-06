/**
 * Embed CMS type definitions.
 *
 * Loaded by the IDE when embed-cms is a dependency. Everything a project needs to start the CMS from its own code is here:
 * the options of `new CMS(options)`, the `cms` object, the API of a resource (`cms.api()('articles')`), the hooks, the plugins and the
 * `RestHelper`. The shapes of a resource definition and its fields, and what the admin puts on `window`, are in
 * `types/global.d.ts` (the `EmbedCMS` namespace), which this file pulls in.
 *
 * The documentation of every option is in docs/reference/CONFIG.md, SECURITY.md, docs/operations/REPLICATION.md and docs/reference/API.md.
 *
 * @example
 * import CMS = require('embed-cms')
 * const options: CMS.Options = { resources: './resources', data: './data', mid: 'webnode1' }
 * const cms = new CMS(options)
 */

/// <reference path="./types/global.d.ts" />

declare module 'embed-cms' {
  /** The Express application, request handler and so on: Express is a dependency of embed-cms, its types are not required */
  type ExpressApp = any
  type ExpressMiddleware = (req: any, res: any, next: (error?: any) => void) => any

  class CMS {
    /**
     * Create a CMS. The options are merged over the file `config` (default `./cms.json`), which is created on the first start.
     * @example
     * const cms = new CMS({ resources: './resources', data: './data', mid: 'webnode1' })
     * const app = express()
     * app.use(cms.express())
     * const server = app.listen(3000, () => cms.bootstrap(server))
     */
    constructor(options?: CMS.Options)

    /** The options after the file, the defaults and the constructor's options were merged */
    options: CMS.Options
    /** The security settings with every default filled in */
    security: CMS.SecurityOptions
    /** Names of the login and session cookies of this server (they carry the `mid`, so two CMS on one host do not clear each other's) */
    cookieNames: { jwt: string; session: string }
    /** The names of the plugins that are on */
    usedPlugins: string[]
    /** Functions the plugins add to run at bootstrap, each one is given a callback to call when it is done */
    bootstrapFunctions: Array<(callback: () => void) => any>

    /**
     * Resource API: a function that gives the API of a resource, with the rights of the code (no user, no group check).
     * The resources named after the resource are resolved: the records come with the records their `select` and
     * `multiselect` fields point to (inside paragraph blocks too), instead of their ids.
     * @example
     * const api = cms.api()
     * const groups = await api('_groups').list()
     * const user = await api('_users').find('user-id')
     * const comment = await api('comments', 'authors').find('comment-id')   // comment.author is the record
     */
    api(): (resourceName: string, ...resolves: string[]) => CMS.ResourceAPI

    /**
     * Declare a resource in code (with `autoload: false`, or in addition to the files), or get a declared one. In `normal` mode an
     * unknown name creates a resource without a schema.
     * @example
     * cms.resource('articles', { displayname: 'Articles', schema: [{ field: 'title', input: 'string' }] })
     */
    resource(name: string, config?: EmbedCMS.ResourceDefinition, resolves?: string[]): CMS.Resource

    /**
     * Install a plugin: `new Plugin(cms, options, configPath)`. The instance is kept under `Plugin.pluginName`, or the class name.
     */
    use<T = any>(plugin: CMS.PluginClass<T>, options?: any, configPath?: string): T

    /** The Express application: mount it in yours with `app.use(cms.express())`. It serves `/admin`, `/api` and the plugin routes. */
    express(): ExpressApp

    /**
     * Start the CMS once the HTTP server listens: opens the stores, creates the built-in groups and users, starts the plugins and the
     * websocket. Resolves when everything is up. The callback form is the older one.
     */
    bootstrap(server?: any, callback?: () => void): Promise<void>
    bootstrap(callback: () => void): Promise<void>

    /** Send a message to every admin that listens on the update websocket */
    broadcast(message: { action: string; data?: any; [key: string]: any }): void

    /** The sync plugin, when the `sync` option is on: run a push or a pull from your own code, see docs/operations/SYNC.md */
    readonly $sync?: CMS.SyncPlugin

    /** Add a heading to the admin menu (a resource's `group` does this by itself) */
    addMenuGroupName(group: string): void

    /** Close the stores and the sockets, then exit the process. Called on SIGINT and SIGTERM. */
    shutdown(signal?: string): void

    /** The class of the API wrapper that `cms.api()` returns, for IDE support */
    static ResourceAPIWrapper: any
    // `CMS.RestHelper` (the middlewares of the REST API, to build your own routes: docs/reference/REST_HELPER.md) and `CMS.PageHelper` (the pages of a public site: docs/reference/PAGE_HELPER.md) are declared in the namespace below
  }

  namespace CMS {
    type CMSRecord = EmbedCMS.CMSRecord
    type Attachment = EmbedCMS.Attachment
    type QueryOptions = EmbedCMS.QueryOptions
    type ResourceDefinition = EmbedCMS.ResourceDefinition
    type FieldDefinition = EmbedCMS.FieldDefinition

    /** Where the records of a resource are kept */
    interface DbEngine {
      type: 'leveldb' | 'sqlite' | 'jsondown' | 'mongodb' | 'postgres'
      /** `host:port/database`, for `mongodb` and `postgres` (credentials: the url for MongoDB, `POSTGRES_USER` and `POSTGRES_PASSWORD` for PostgreSQL) */
      url?: string
    }

    /** `security`: every protection is on by default, see SECURITY.md */
    interface SecurityOptions {
      /** Refuse to start with a missing, short or published secret. `true` in production. */
      strongSecrets?: boolean
      /** With `strongSecrets`: generate the missing secrets once into `<data>/.secrets.json` */
      generateSecrets?: boolean
      /** Create the built-in `localAdmin` user. `false` in production. */
      localAdmin?: boolean
      passwordHash?: 'legacy' | 'scrypt'
      hideCredentials?: boolean
      genericLockout?: boolean
      /** Refuse writes (and state changing GET) that come from another site */
      csrf?: 'origin' | false | string
      /** Origins that count as the same site for `csrf` and the update websocket */
      allowedOrigins?: string[]
      cookies?: { httpOnly?: boolean; sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean | 'auto' }
      strictSessions?: boolean
      redactConfig?: boolean
      strictAdmin?: boolean
      headers?: boolean
      /** A policy string, or `false` for none */
      contentSecurityPolicy?: string | false
      /** Origins that may read `/api/system` and `/api/_syslog` */
      sseCors?: string[] | string
      safeRegex?: boolean
      uniformErrors?: boolean
      safeAttachments?: boolean
      /** Extra content types that may be shown inline */
      inlineTypes?: string[]
      strictUploads?: boolean
      limits?: {
        /** Size of a JSON body, e.g. `'100kb'` */
        json?: string | number
        upload?: { fileSize?: string | number; files?: number; fields?: number; fieldSize?: string | number; parts?: number }
      }
      restrictRemoteUrls?: boolean
      strictReplication?: boolean
      wsAuth?: boolean
      /** Largest message a websocket client may send, bytes */
      wsMaxPayload?: number
      /** Milliseconds a verified password stays verified in memory; `0` turns it off */
      authCacheTtl?: number
      [setting: string]: any
    }

    interface ReplicationPeer {
      host?: string
      port?: number
      url?: string
      direction?: 'normal' | 'upstream' | 'downstream'
    }

    interface ReplicationOptions {
      /** The peers of every resource */
      peers?: ReplicationPeer[]
      /** Peers per resource name, replacing `peers` for that resource */
      peersByResource?: Record<string, ReplicationPeer[]>
      /** Basic credentials used to download files from a peer that needs a login */
      auth?: { username: string; password: string }
      /** Shared secret of the replication port, required when `netPort` is set */
      secret?: string
      strictTypes?: boolean
      settleDelay?: number
      maxRecordBytes?: number
      [setting: string]: any
    }

    interface SyslogOptions {
      method: 'file' | 'journalctl' | 'syslog' | 'command'
      /** `file`: the log file */
      path?: string
      /** `journalctl` and `syslog`: the service identifier */
      identifier?: string
      /** `command`: any command whose output is followed, e.g. `'tail -F /var/log/app.log'` */
      command?: string
      /** Lines kept in memory and sent to a page that opens (2000) */
      max?: number
      /** A longer line is cut on the page (10000) */
      maxLineLength?: number
      /** A log file past this size is rotated, bytes (10 MB) */
      maxFileSize?: number
      /** A page that stops reading is dropped past this many bytes (8 MB) */
      maxClientBuffer?: number
    }

    /** `sync`: see docs/operations/SYNC.md */
    interface SyncOptions {
      /** The resources that may be synced until some are chosen in the Sync settings of the admin, which then take over */
      resources?: string[]
      /**
       * When to run a push or a pull of all the resources to sync on its own: a cron expression of five fields (minute hour day-of-month
       * month day-of-week) in the time zone of the server, such as `'0 3 * * *'` for every night at 3. A direction left out is not scheduled.
       */
      schedule?: { push?: string | null; pull?: string | null }
      [setting: string]: any
    }

    /** How one resource went in a sync run */
    interface SyncResult {
      resource: string
      status: 'done' | 'error'
      created?: number
      updated?: number
      removed?: number
      /** Why it failed, when `status` is `'error'` */
      error?: string
      startedAt: number
      finishedAt: number
    }

    /** A run of the syncs of the resources to sync, one after the other */
    interface SyncRun {
      direction: 'push' | 'pull'
      /** Who started it: `'api'` (your code), `'manual'` (the admin or `cms-sync`), `'schedule'` */
      trigger: 'api' | 'manual' | 'schedule'
      status: 'done' | 'error'
      startedAt: number
      finishedAt: number
      resources: string[]
      results: SyncResult[]
    }

    /** `cms.$sync`: syncing from code. Only one run goes on at a time: a second one is refused with an error whose `code` is 409. */
    interface SyncPlugin {
      /** Sync one resource now and answer how it went, when the other CMS has finished with it. `push`: this CMS writes to the other one. `pull`: the other CMS writes here. */
      run(resource: string, direction: 'push' | 'pull'): Promise<SyncResult>
      /** Sync the resources to sync (or only `options.resources`), one after the other, and answer when they are all done. One that fails does not stop the others. */
      runAll(direction: 'push' | 'pull', options?: { resources?: string[] }): Promise<SyncRun>
      /** The resources this CMS may sync: the ones chosen in the Sync settings, else the ones of `sync.resources` */
      syncedResources(): Promise<string[]>
    }

    /** `import`: the Google Sheets import, see docs/operations/IMPORT.md */
    interface ImportOptions {
      resources?: string[]
      gsheetId?: string
      oauth?: { email: string; keyFile: string }
      createOnly?: boolean
      [setting: string]: any
    }

    /** Options of `new CMS(options)` and of `cms.json` */
    interface Options {
      // ---- core
      /** Where to read (and first write) the configuration file. Default `./cms.json`. */
      config?: string
      /** Folder of the resource declarations. Default `./resources`. */
      resources?: string
      /** The parent folder of `paragraphs/`. Default: the same as `resources`. */
      paragraphs?: string
      /** Where records and attachments are stored. Default `./data`. */
      data?: string
      /** Load every file of `resources` at start-up. Default `true`. */
      autoload?: boolean
      /** `normal` creates a resource on the fly when code asks for an unknown one, any other value does not */
      mode?: 'normal' | 'strict' | string
      /** Machine id: exactly 8 characters, part of every record id. Each node of a cluster needs its own. */
      mid?: string
      /** Extra path segments between `data` and the resource folders */
      ns?: string[]
      /** The store of the records. Default: LevelDB on disk. */
      dbEngine?: DbEngine
      /** Generates the ids of the records. Default: a 20 characters time based id. */
      uuid?: () => string

      // ---- features
      disableREST?: boolean
      disableAdmin?: boolean
      disableReplication?: boolean
      /** Turn the sync plugin on by giving it a block (`{}` is enough) */
      sync?: SyncOptions
      import?: ImportOptions
      importFromRemote?: boolean | Record<string, any>
      /** Turn the Excel export and import routes on */
      xlsx?: boolean
      /** The folder of the translations of your project (`frFR.json`, a flat object of `TL_KEY: "text"`), put over the ones of the CMS. Default `./i18n`. */
      i18n?: string
      /** Resource names anyone may read without a login */
      anonymousRead?: string[]
      /** Broadcast record changes over a websocket. Default `true`. */
      wsRecordUpdates?: boolean
      /** `true` (the default): the login page and the admin are always light */
      disableDarkMode?: boolean
      /** The map of the `geopoint` field: OpenStreetMap by default, the tile server and the search you name, or `false` for no map (the field is then its two boxes). */
      maps?: false | {
        tiles?: { url: string; attribution?: string | { text: string; url?: string }; maxZoom?: number }
        search?: false | { url: string }
      }
      admin?: { language?: { defaultLocale?: string; locales?: string[] }; [setting: string]: any }
      /** Text of the admin's top bar */
      toolbarTitle?: EmbedCMS.Translatable

      // ---- authentication
      /** Basic authentication is on by default; `true` with `disableJwtLogin: true` is no authentication at all */
      disableAuthentication?: boolean
      /** `false` shows the login page and uses the JWT cookie. Default `true`. */
      disableJwtLogin?: boolean
      /** Sign the JWTs. Longer than 16 characters; the published default is refused in production. */
      auth?: { secret: string; [setting: string]: any }
      /** Sign the session cookie. `name` replaces the default session cookie name. */
      session?: { secret: string; name?: string; resave?: boolean; saveUninitialized?: boolean; [setting: string]: any }
      /** Routes that require a login before anything else runs (replaces the default list) */
      routesToAuth?: string[]
      disableAnonymous?: boolean
      /** Lock an account after `retry` failed logins, for `duration` minutes. `false` turns it off. */
      blockRetry?: { retry: number; duration: number } | false

      // ---- security and limits
      security?: SecurityOptions
      /** Passed to Express `trust proxy`: the number of proxies in front of the CMS */
      trustProxy?: boolean | number | string | string[]
      /** Image operations that run at once. Default: the number of cores; `0` is no limit. */
      imageConcurrency?: number
      /** Milliseconds a file must be idle before `cleanAttachment` may remove it. Default 300000. */
      attachmentCleanupGrace?: number

      // ---- replication and logs
      /** Port to listen on for replication peers. Without it the node does not listen. */
      netPort?: number
      replication?: ReplicationOptions
      syslog?: SyslogOptions

      /** Anything a plugin of yours reads */
      [option: string]: any
    }

    /** What `context.params` holds in a hook: `object` is the record being written, `id` the record asked for, and so on */
    interface HookParams {
      object?: Record<string, any>
      id?: string
      query?: Record<string, any>
      options?: Record<string, any>
      [param: string]: any
    }

    /** What a hook is given */
    interface HookContext {
      params: HookParams
      /** The result of the operation (in an `after` hook) */
      _result?: any
      /** Carry on */
      next(): any
      /** Stop and answer with an error: `context.error({ code: 400, message: '...' })` */
      error(error: { code?: number; message: string; [key: string]: any } | Error): any
      [key: string]: any
    }

    type HookEvent =
      | 'create' | 'read' | 'find' | 'list' | 'update' | 'remove'
      | 'createAttachment' | 'findAttachment' | 'updateAttachment' | 'removeAttachment'

    type HookFunction = (context: HookContext) => any

    /** The API of a resource, `cms.api()('articles')`. Runs with every right: check the rights yourself before you expose it. */
    interface ResourceAPI {
      /** The declaration of the resource */
      options: EmbedCMS.ResourceDefinition
      /** Records matching a filter, as an array. Without `limit` it returns every record. */
      list(query?: Record<string, any>, options?: QueryOptions): Promise<CMSRecord[]>
      /** One record by id, or the first one matching a filter. `null` when there is none. */
      find(idOrQuery: string | Record<string, any>, options?: QueryOptions): Promise<CMSRecord | null>
      exists(idOrQuery: string | Record<string, any>): Promise<boolean>
      create(data: Partial<CMSRecord>, options?: any): Promise<CMSRecord>
      update(id: string, data: Partial<CMSRecord>, options?: any): Promise<CMSRecord>
      remove(id: string): Promise<boolean>
      /** Add a file to a record. `name` is the field. */
      createAttachment(id: string, attachment: {
        name: string
        stream: NodeJS.ReadableStream
        fields?: Record<string, any>
        payload?: Record<string, any>
        cropOptions?: Record<string, any>
        order?: number
      }): Promise<Attachment>
      updateAttachment(id: string, aid: string, data: Partial<Attachment>): Promise<Attachment>
      /** An attachment with a readable `stream`. `resize` is `'300x200'`, `smart` crops around what matters. */
      findAttachment(id: string, aid: string, options?: { resize?: string; smart?: boolean; [option: string]: any }): Promise<Attachment>
      /** The stream of an attachment by its id alone */
      findFile(aid: string): Promise<NodeJS.ReadableStream>
      removeAttachment(id: string, aid: string): Promise<boolean>
      /** Remove the files no record points to (only those idle for `attachmentCleanupGrace`) */
      cleanAttachment(): Promise<boolean>
      /**
       * Runs many writes as one: inside `work`, the writes of this resource do not wait for the disk, which is waited for once
       * at the end. For a sync or an import of many records.
       */
      bulk<T>(work: () => Promise<T>): Promise<T>
      /** What an import would create, update and remove */
      getImportMap(importList: any[], query?: Record<string, any>, checkRequired?: boolean): Promise<{
        create: CMSRecord[]
        update: CMSRecord[]
        remove: CMSRecord[]
      }>
      getUniqueKeys(): string[]
      /** Run a function before an operation, for the REST API and the JavaScript API alike: call `context.next()` to carry on */
      before(event: HookEvent, fn: HookFunction): this
      after(event: HookEvent, fn: HookFunction): this
      beforeAll(fn: HookFunction): this
      afterAll(fn: HookFunction): this
    }

    /** A resource itself, from `cms.resource(name)` and `req.resource` (the REST helper): the API, and the read of a list */
    interface Resource extends ResourceAPI {
      name: string
      /** An array, like `GET /api/:resource`: `read(query, { page, limit })`. Pages count from 0. */
      read(query?: Record<string, any>, options?: QueryOptions): Promise<CMSRecord[]>
      broadcast(message: { action: string; data?: any }): void
    }

    /** A plugin is a class: `new Plugin(cms, options, configPath)`. It can push functions to `cms.bootstrapFunctions`. */
    interface PluginClass<T = any> {
      new (cms: CMS, options?: any, configPath?: string): T
      /** The name the instance is kept under (default: the class name) */
      pluginName?: string
    }

    /** The context the REST middlewares read: only `cms` */
    interface RestContext {
      cms: CMS
    }

    /**
     * The middlewares of the REST API, for your own routes. Use them in this order: `find_resource`, then `authorize`, then
     * `parse_query`, and parse the JSON body before `authorize`. See docs/reference/REST_HELPER.md.
     */
    class RestHelper {
      mw: {
        /** 404 for an unknown `:resource`, else sets `req.resource` */
        find_resource(ctx: RestContext): ExpressMiddleware
        /** Identifies the caller and checks the right of the HTTP method: 401 when the group lacks it. Sets `req.body._updatedBy`, and `req.body._createdBy` on a create. */
        authorize(ctx: RestContext): ExpressMiddleware[]
        /** Parses `?query=` and copies the other parameters into `req.options` */
        parse_query: ExpressMiddleware
        /** Answers the declaration of every resource */
        list_resources(ctx: RestContext): ExpressMiddleware
      }
      /** The built-in route handlers */
      routes: any
    }

    /** A template of a PageHelper: the path of its file, or `{ source }` for one written in the code */
    type PageTemplate = string | { source: string }

    interface PageHelperOptions {
      /** The CMS the content comes from, read through `cms.api()` (no rights are checked: it is your server) */
      cms: CMS
      /** Every template, by name. A name is what `{{> name}}` and `route(name)` use. Read and checked when the helper is made. */
      templates: Record<string, PageTemplate>
      /** Where the finished pages are kept: a folder (they survive a restart), nothing for the memory of the process, `false` for nowhere */
      cache?: string | false
      /** How many pages the memory keeps (500 by default) */
      maxPages?: number
      /** Given to every page, under the data of the page */
      locals?: Record<string, any>
      /** Seconds a kept page lives at most (3600 by default, 0 for no limit) */
      maxAge?: number
      /** Seconds between two checks of a kept page (0, every request, by default) */
      revalidate?: number
      /** The template of the 404 page: it gets `status`, `title` and `url` */
      notFound?: string
      /** The template of the page of an error: it gets `status`, `title` and `message` (empty for a 5xx) */
      error?: string
    }

    /** What a loader gets */
    interface PageContext {
      /** `cms.api()`: the resources it is used on are what the kept page depends on */
      api: (name: string, ...rest: string[]) => ResourceAPIWrapper
      cms: CMS
      params: Record<string, string>
      query: Record<string, any>
      req: any
      res: any
      /** Return it to answer the 404 page */
      notFound(): symbol
    }

    interface PageRouteOptions {
      /** Seconds this page is kept, over the one of the helper */
      maxAge?: number
      /** `false`: this page is made for every request */
      cache?: boolean
      /** The query parameters that change the page (`['page']`): without them the query is not part of what a page is */
      vary?: string[]
      /** Response headers; `Cache-Control` is `no-cache` unless it is here */
      headers?: Record<string, string>
    }

    /**
     * Renders the pages of a public site from the content, with Mustache templates, and keeps the finished pages. See docs/reference/PAGE_HELPER.md.
     * @example
     * const pages = new CMS.PageHelper({ cms, templates: { home: 'views/home.html', header: 'views/header.html' }, notFound: 'notfound' })
     * app.get('/', pages.route('home', async ({ api }) => ({ articles: await api('articles').list({ published: true }) })))
     */
    class PageHelper {
      constructor(options: PageHelperOptions)
      /** The names of the templates */
      names(): string[]
      has(name: string): boolean
      /** Renders a template with data (over `locals`): only the templates are cached, since the data is yours */
      render(name: string, data?: Record<string, any>): Promise<string>
      /** An Express handler: runs the loader (nothing to load for a page of text), renders `name` and keeps the page */
      route(name: string, loader?: ((context: PageContext) => Record<string, any> | symbol | Promise<Record<string, any> | symbol>) | PageRouteOptions, options?: PageRouteOptions): ExpressMiddleware
      /** The middleware that goes after the routes: the 404 page of an address no route answered */
      notFoundHandler(): ExpressMiddleware
      /** The error middleware that goes after the routes: the error page of what a route or a middleware threw */
      errorHandler(): (error: any, req: any, res: any, next: (error?: any) => void) => any
      /** Makes the pages that read a resource old: they are made again when asked for */
      invalidate(resource: string): void
      /** Drops the kept pages; resolves to how many */
      clear(): Promise<number>
    }
  }

  export = CMS
}
