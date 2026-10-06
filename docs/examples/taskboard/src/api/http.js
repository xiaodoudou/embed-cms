// The only place that talks HTTP to the CMS. Everything else of the app asks this: a record, a list, a write, a file. It knows the shape of the REST API of embed-cms
// (docs/reference/API.md): JSON in and out, a `query` filter as JSON, `limit` and `page` (from 0), the total in the `numRecords` header, a multipart upload for a file.

/** An answer that is not a success: the status, the reason the CMS gave, and what it said. */
export class ApiError extends Error {
  /**
   * @param {number} status the HTTP status; 0 when there was no answer (the network)
   * @param {string} message
   * @param {*} [body]
   */
  constructor (status, message, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** @returns {boolean} whether an error is the end of a request that was cancelled on purpose: not a fault to show */
export const isAbort = (error) => Boolean(error) && error.name === 'AbortError'

/**
 * @param {object} [parts]
 * @param {object} [parts.query] a filter in the MongoDB style, for the CMS to evaluate
 * @param {number} [parts.limit] the size of a page
 * @param {number} [parts.page] the page, from 0
 * @param {object} [parts.params] more parameters of the address (`resize`...)
 * @returns {string} what goes after the path: `?query=%7B...%7D&limit=200`, or nothing
 */
export function toQuery ({ query, limit, page, params } = {}) {
  const search = new URLSearchParams()
  if (query && Object.keys(query).length) {
    search.set('query', JSON.stringify(query))
  }
  if (limit !== undefined) {
    search.set('limit', String(limit))
  }
  if (page !== undefined) {
    search.set('page', String(page))
  }
  for (const [name, value] of Object.entries(params || {})) {
    search.set(name, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/**
 * What the CMS said, whatever it sent: its JSON (an error is `{ code, message }` or `{ error }`), or text.
 * @param {Response} res
 * @returns {Promise<*>}
 */
async function readBody (res) {
  const text = await res.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * @param {Response} res
 * @param {*} body
 * @returns {string} the reason of a refusal, in a line a person can read
 */
function reasonOf (res, body) {
  if (body && typeof body === 'object') {
    return body.message || body.error || `${res.status} ${res.statusText}`.trim()
  }
  return (typeof body === 'string' && body.length < 200 && body) || `${res.status} ${res.statusText}`.trim()
}

/**
 * @param {object} [options]
 * @param {string} [options.base] where the CMS is: nothing for the address of the page (what the app wants: one address, one cookie)
 * @param {typeof fetch} [options.fetch] what makes the requests: the one of the browser, or another in a test
 * @param {function(ApiError): void} [options.onUnauthorized] told when the CMS says that nobody is signed in (a session that ended): the app goes to its login
 * @param {function(): XMLHttpRequest} [options.xhr] what makes an upload (fetch cannot tell how far a file has gone)
 */
export function createHttp ({ base = '', fetch: fetchImpl = (...args) => globalThis.fetch(...args), onUnauthorized = () => {}, xhr = () => new XMLHttpRequest() } = {}) {
  /**
   * @param {string} method
   * @param {string} path
   * @param {object} [options]
   * @param {object} [options.body] sent as JSON
   * @param {AbortSignal} [options.signal] to cancel the request
   * @returns {Promise<{data: *, total: number|undefined}>}
   */
  async function send (method, path, { body, signal } = {}) {
    const headers = { Accept: 'application/json' }
    const init = { method, signal, headers, credentials: 'same-origin' }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    let res
    try {
      res = await fetchImpl(base + path, init)
    } catch (error) {
      if (isAbort(error)) {
        throw error
      }
      throw new ApiError(0, 'The server cannot be reached.', error)
    }
    const data = await readBody(res)
    if (!res.ok) {
      const error = new ApiError(res.status, reasonOf(res, data), data)
      if (res.status === 401) {
        onUnauthorized(error)
      }
      throw error
    }
    const header = res.headers && res.headers.get ? res.headers.get('numRecords') : null
    return { data, total: header === null ? undefined : Number(header) }
  }

  return {
    /** @returns {Promise<*>} what the CMS answers to a GET */
    get: async (path, options) => (await send('GET', path, options)).data,
    post: async (path, body, options) => (await send('POST', path, { ...options, body })).data,
    put: async (path, body, options) => (await send('PUT', path, { ...options, body })).data,
    delete: async (path, options) => (await send('DELETE', path, options)).data,

    /**
     * One page of a list, with how many there are in all.
     * @param {string} resource
     * @param {object} [parts] see toQuery
     * @param {AbortSignal} [signal]
     * @returns {Promise<{items: Array<object>, total: number|undefined}>}
     */
    async page (resource, parts, signal) {
      const { data, total } = await send('GET', `/api/${resource}${toQuery(parts)}`, { signal })
      return { items: Array.isArray(data) ? data : [], total }
    },

    /**
     * Sends a file to a record, and says how far it has gone. The name of the part is the field the file belongs to (that is how the CMS knows).
     * @param {string} resource
     * @param {string} id the record
     * @param {object} file
     * @param {string} file.field the field of the resource
     * @param {File|Blob} file.blob
     * @param {string} [file.name] the name to keep
     * @param {function(number): void} [file.onProgress] from 0 to 1
     * @param {AbortSignal} [file.signal]
     * @returns {Promise<object>} what the CMS answers: the attachment, with its address
     */
    upload (resource, id, { field, blob, name = blob.name, onProgress = () => {}, signal }) {
      return new Promise((resolve, reject) => {
        const request = xhr()
        request.open('POST', `${base}/api/${resource}/${encodeURIComponent(id)}/attachments`)
        request.withCredentials = true
        request.setRequestHeader('Accept', 'application/json')
        request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total)
        request.onerror = () => reject(new ApiError(0, 'The server cannot be reached.'))
        request.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }))
        request.onload = () => {
          let body
          try {
            body = JSON.parse(request.responseText)
          } catch {
            body = request.responseText
          }
          if (request.status >= 200 && request.status < 300) {
            onProgress(1)
            return resolve(body)
          }
          const error = new ApiError(request.status, (body && (body.message || body.error)) || `${request.status} ${request.statusText}`.trim(), body)
          if (request.status === 401) {
            onUnauthorized(error)
          }
          return reject(error)
        }
        if (signal) {
          signal.addEventListener('abort', () => request.abort(), { once: true })
        }
        const form = new FormData()
        form.append(field, blob, name)
        request.send(form)
      })
    }
  }
}
