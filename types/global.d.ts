/**
 * Ambient declarations for Embed CMS, for IDE autocomplete in a project that uses it:
 *  - the shapes of a resource definition (what a file of `resources/` exports) and of its fields,
 *  - the records and attachments the API returns,
 *  - what the admin app puts on `window`, for the plugins that run inside it.
 *
 * The server API (`new CMS(options)`, `cms.api()`) is typed in `index.d.ts`.
 * The documentation of every option is in docs/reference/FIELDS.md and docs/start/CONCEPTS.md.
 */

declare namespace EmbedCMS {
  /** A text, or one text per language: `'Price'` or `{ enUS: 'Price', zhCN: '价格' }` */
  type Translatable = string | { [locale: string]: string }

  /** A record, with the fields the CMS adds */
  interface CMSRecord {
    /** Unique identifier of the record */
    _id: string
    /** Creation time, milliseconds */
    _createdAt: number
    /** Last update time, milliseconds */
    _updatedAt: number
    /** Publication time, milliseconds */
    _publishedAt?: number
    /** Who changed it last, `group~username` */
    _updatedBy?: string
    /** Who created it, `group~username`: written once, when the record is created over REST. Older records do not have it. */
    _createdBy?: string
    /** The files of the record */
    _attachments?: Attachment[]
    /** `false` for a record that comes from another server (downstream replication), which cannot be edited here */
    _local?: boolean
    /** The fields of the resource's schema */
    [field: string]: any
  }

  interface Attachment {
    _id: string
    /** The field the file belongs to */
    _name: string
    _filename: string
    /** MIME type */
    _contentType: string
    _md5sum: string
    /** Size in bytes */
    _size: number
    _createdAt: number
    _updatedAt: number
    /** The extra fields sent with the upload */
    _fields?: Record<string, any>
    _payload?: Record<string, any>
    /** Where the image is cropped, when it is */
    cropOptions?: Record<string, any>
    /** Position among the files of the field */
    order?: number
    /** The content, when the attachment is read */
    stream?: NodeJS.ReadableStream
  }

  interface QueryOptions {
    /** Page number, from 0 */
    page?: number
    /** Records per page */
    limit?: number
    /** Content language of the plain values */
    locale?: string
  }

  /** The `input` of a field: the type of control the admin draws, see docs/reference/FIELDS.md */
  type FieldInput =
    | 'string' | 'transliterate' | 'text' | 'password' | 'email' | 'url'
    | 'number' | 'integer' | 'double'
    | 'checkbox' | 'color' | 'rating' | 'duration' | 'money' | 'phone' | 'markdown'
    | 'date' | 'time' | 'datetime'
    | 'pillbox' | 'select' | 'multiselect'
    | 'json' | 'object' | 'code' | 'wysiwyg'
    | 'image' | 'cropimage' | 'imagemap' | 'file' | 'paragraph'

  /** A pattern for the text types */
  interface FieldRegex {
    /** `'/pattern/flags'` */
    value: string
    /** What is shown when the text does not match */
    description?: Translatable
  }

  /** `options` of a field. Every key is also copied onto the component, so a type can take more than these. */
  interface FieldOptions {
    /** Help text under the label */
    hint?: Translatable
    /** Not editable, still visible and copyable */
    readonly?: boolean
    /** Greyed out and not focusable */
    disabled?: boolean
    /** Length of a text, value of a number, how many icons of a `rating` (1 to 10, 5 by default), seconds of a `duration` */
    min?: number
    max?: number
    /** Pattern for the text types, or one per locale */
    regex?: FieldRegex | { [locale: string]: FieldRegex }
    /** `select` and `multiselect`: a readable label per static value, `{ low: { enUS: 'Low', zhCN: '低' } }` */
    labels?: Record<string, Translatable>
    /** `select` and `multiselect`: a Mustache template that labels a record of the source resource, e.g. `'{{name}}'` */
    customLabel?: string
    /** `select` and `multiselect`: a line under each option (Mustache template) */
    subtitle?: string
    /** `select` and `multiselect`: the field that groups the options */
    groupBy?: string
    /** `image` and `file`: the accepted extensions, e.g. `'.png,.svg'` */
    accept?: string
    /** `image` and `file`: the most files the field takes */
    maxCount?: number
    /** `image` and `file`: the largest file, in bytes */
    limit?: number
    /** `rating`: what it is made of, star by default */
    icon?: 'star' | 'heart' | 'thumb' | 'flame' | 'bolt' | 'circle'
    /** `rating`: the colour of the filled icons, a colour of the theme */
    color?: 'primary' | 'info' | 'success' | 'warning' | 'error'
    /** `rating`: half steps */
    half?: boolean
    /** `rating`: whether the rating can be taken away (true by default) */
    clearable?: boolean
    /** `duration`: the boxes to show, largest first whatever the order (hours and minutes by default); `min` and `max` are in seconds */
    units?: Array<'days' | 'hours' | 'minutes' | 'seconds'>
    /** `money`: the one currency it takes (an ISO 4217 code, 'EUR'); `min` and `max` are amounts */
    currency?: string
    /** `money`: the currencies it offers, when there is more than one (the common ones by default) */
    currencies?: string[]
    /** `markdown`: the buttons of the toolbar, in the order of the toolbar (`'bold'`, `'italic'`, `'strike'`, `'heading'`, `'quote'`, `'ul'`, `'ol'`, `'code'`, `'link'`); `false` for none, all by default */
    toolbar?: boolean | Array<'bold' | 'italic' | 'strike' | 'heading' | 'quote' | 'ul' | 'ol' | 'code' | 'link'>
    /** `markdown`: where the preview is: in a tab (by default), beside the box, or `false` for none */
    preview?: 'tabs' | 'split' | false
    /** `markdown`: the height of the box in lines (8 by default), and how many it grows to before it scrolls */
    rows?: number
    maxRows?: number
    /** `string`: a template the box keeps while it is typed in: `_` or `#` a digit, `A` a letter, `*` a letter or a digit, a backslash makes the next character itself, the rest is written for you (`'(___) ___-____'`, `'F__-AAAA'`) */
    mask?: string
    /** `duration`: the template of the box, written like a mask with digits only (`'__:__'`, `'_h __m'`, `'___ days'`); its parts give the units */
    template?: string
    /** `phone`: the countries it takes, ISO 3166 codes (every one by default); `country` is the one it starts with */
    countries?: string[]
    country?: string
    /** `imagemap`: the resources a record link can be from, by name or `{ resource, label, title }` (`label` is a Mustache template that names a record, `title` what the kind of record is called) */
    references?: Array<string | { resource: string, label?: string, title?: Translatable }>
    /** `imagemap`: what an area can link to: an address, a record (needs `references`), a value the person types */
    links?: 'url' | 'record' | 'value' | Array<'url' | 'record' | 'value'>
    /** `imagemap`: asks where a record opens (an address always does) */
    openIn?: boolean
    /** `imagemap`: the words of the three kinds of link */
    labels?: { url?: Translatable, record?: Translatable, value?: Translatable }
    /** `cropimage`: the one ratio the crop may have, `1.5`, `'3:2'` or `'16/9'` */
    aspectRatio?: number | string
    /** `cropimage`: the shapes to choose from, ratios (`1.5`, `'3:2'`, `[3, 2]`, `{ ratio: '4:5', label: 'Portrait' }`) and `'free'` and `'original'` */
    aspectRatios?: Array<number | string | [number, number] | { ratio: number | string, label?: string } | 'free' | 'original'>
    /** `cropimage`: `'circle'` leaves the corners of the result transparent; fixes the shape, with no choice for the person */
    shape?: 'rect' | 'circle'
    /** `cropimage`: what the result starts with, changeable in the tool unless `width` and `height` fix the size */
    output?: { maxWidth?: number, maxHeight?: number, format?: 'jpeg' | 'png' | 'webp', quality?: number }
    /** `cropimage` and `image`: with `height`, the size of the result (`cropimage`), or the size the picture is resized to on upload (`image`) */
    width?: number
    height?: number
    /** `wysiwyg`: the buttons of the toolbar */
    buttons?: string[]
    /** `code`: the CodeMirror mode, e.g. `'text/javascript'`, `'htmlmixed'`, `'css'` */
    mode?: string
    [option: string]: any
  }

  /** One entry of a resource's `schema` */
  interface FieldDefinition {
    /** The key of the value. A dotted key (`address.city`) nests the value and groups the fields in the form. */
    field: string
    input: FieldInput
    /** A text, a translation key, or one text per language. Defaults to `field`. */
    label?: Translatable
    /** Saving is refused while the field is empty (checked by the admin) */
    required?: boolean
    /** Checked by the server on create and update */
    unique?: boolean
    /** One value per content language. Defaults to `true` when the resource declares `locales`. */
    localised?: boolean
    /** `select` and `multiselect`: the values, or the name of the resource the options come from */
    source?: string[] | string
    /** `select` and `multiselect`: the records of several resources in one list, in groups, by name or `{ resource, customLabel, title }`; the value kept is `{ resource, id }` */
    sources?: Array<string | { resource: string, customLabel?: string, title?: Translatable }>
    /** `pillbox`: fewest and most tags */
    min?: number
    max?: number
    /** Same as `options.hint` */
    hint?: Translatable
    /** Same as `options.disabled` */
    disabled?: boolean
    options?: FieldOptions
    [key: string]: any
  }

  /** Where the records of a resource go to or come from: see docs/operations/REPLICATION.md */
  type ResourceDirection = 'normal' | 'downstream' | 'upstream'

  /** What a file of `resources/` exports */
  interface ResourceDefinition {
    /** The name shown in the admin */
    displayname?: Translatable
    /** The heading of the admin menu it is listed under */
    group?: Translatable
    /** The content languages */
    locales?: string[]
    /** `'table'` shows a grid with a column per field instead of the list */
    view?: 'table'
    /** The most records it holds. With `1` the admin opens the single record directly. */
    maxCount?: number
    type?: ResourceDirection
    /** Titles of the nested fields, keyed by prefix: `{ address: { label: 'Address' } }` */
    groups?: Record<string, { label?: Translatable }>
    /** The user groups that see it in the admin menu (the API does not enforce this: use the rights of the groups) */
    allowed?: string[]
    schema: FieldDefinition[]
    [key: string]: any
  }

  /** A page that a plugin adds to the admin menu: `window.plugins.push({ ... })` */
  interface AdminPlugin {
    /** The name the component is registered under (`app.component(title, ...)`) */
    title: string
    /** What the `plugins` of a user group name. It never changes. */
    displayname: string
    /** The translation key of the name shown in the menu */
    label?: string
    /** The component to show */
    component: any
    /** Same as `title`: the component the page mounts */
    pluginComponent?: string
    /** The menu group it is listed under */
    group?: string
    /** The user groups that may open it */
    allowed?: string[]
    type?: 'plugin'
  }

  interface DialogOptions {
    title?: string
    message?: string
    cancel?: string
    confirm?: string
    callback?: () => void
    onCancel?: () => void
    [key: string]: any
  }

  /** The records of a resource over REST, with the login and the rights of the person */
  interface HostResourceApi {
    /** `query` is a filter in the MongoDB style, `page` counts from 0 */
    list(query?: Record<string, any>, options?: QueryOptions): Promise<CMSRecord[]>
    find(id: string): Promise<CMSRecord>
    create(record: Record<string, any>): Promise<CMSRecord>
    update(id: string, record: Record<string, any>): Promise<CMSRecord>
    remove(id: string): Promise<boolean>
  }

  /** What a plugin of the admin may rely on, in one object: `window.embedCms.host`, `useAdmin()` or `this.$admin` */
  interface Host {
    /** The records of a resource over REST */
    api(resource: string): HostResourceApi
    /** `fetch` to the CMS: a relative URL is counted from the admin page, and the login cookie goes along */
    fetch(url: string, init?: RequestInit): Promise<Response>
    /** The person who is logged in, or null */
    readonly user: { username: string; group: string; language?: string; theme?: string } | null
    /** Whether the group of the person has a right on a resource. The server decides in the end. */
    can(right: 'read' | 'create' | 'update' | 'remove' | 'attachments', resource: string): boolean
    /** The public part of the configuration */
    readonly config: Record<string, any>
    /** The text of a translation key of the admin */
    t(key: string, params?: Record<string, any>): string
    /** The language of the admin */
    readonly locale: string
    /** Show a toast */
    notify(message: string, kind?: 'success' | 'info' | 'warn' | 'error', extra?: Record<string, any>): void
    /** The shared dialog: true on confirm, false on cancel */
    confirm(options: DialogOptions): Promise<boolean>
    /** Open a resource, or a record of it */
    navigate(target: { resource: string; record?: string }): void
    /** The theme, reactive */
    readonly theme: { mode: 'light' | 'dark' }
    /** The SVG of an icon the admin uses, by its alias name; empty for an unknown name */
    icon(name: string): string
    /** The UI kit as a stylesheet to adopt in a shadow root; null where the browser has none */
    kitStyles(): Promise<CSSStyleSheet | null>
    /** Listen to an event. Returns a function that stops listening. */
    on(event: 'record:saved', listener: (payload: { resource: string; record: CMSRecord; created: boolean }) => void): () => void
    on(event: 'record:removed', listener: (payload: { resource: string; id: string }) => void): () => void
    on(event: 'locale:changed' | 'theme:changed', listener: (value: string) => void): () => void
  }

  /** The dialog every page shares, `window.DialogService` */
  interface DialogService {
    show(options: DialogOptions): void
    /** Resolves `true` on confirm, `false` on cancel or Escape */
    ask(options: DialogOptions): Promise<boolean>
    confirm(options: DialogOptions): void
    send(isEditing: boolean): void
  }

  /** The translations of the admin, `window.TranslateService` */
  interface TranslateService {
    /** The language of the admin, which is the language of the user */
    locale: string
    /** One dictionary per language: `{ enUS: { TL_SAVE: 'Save' } }` */
    dict: Record<string, Record<string, string>>
    /** The text of a translation key, with the `{{params}}` filled in */
    get(key: string, params?: Record<string, any>): string
    getLocales(): string[]
    setLocale(locale: string): void
  }
}

interface Window {
  /** The pages that plugins add to the admin menu. Fill it before the `load` event, or push to it at any time. */
  plugins?: EmbedCMS.AdminPlugin[]
  /** The admin's Vue application, once it is mounted; `host` is what a plugin relies on */
  embedCms?: { host: EmbedCMS.Host; [key: string]: any }
  /** Vue itself, for a plugin that does not bundle its own */
  Vue?: any
  DialogService?: EmbedCMS.DialogService
  TranslateService?: EmbedCMS.TranslateService
  /** The server answers without a login page */
  disableJwtLogin?: boolean
  /** No login at all: authentication is off */
  noLogin?: boolean
}
