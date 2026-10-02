const _ = require('lodash')
const path = require('path')
const fs = require('fs-extra')

class RequestService {
  /**
   * @param {{username: string, password: string}} auth - login of the remote cms
   * @param {object} [settings]
   * @param {string} [settings.origin] - origin of the remote cms (e.g. http://host:9990): only requests to it carry credentials
   * @param {boolean} [settings.restrictUrls] - refuse to fetch urls whose host is neither the remote's nor in allowedHosts
   * @param {string[]} [settings.allowedHosts] - hosts (with port) that attachments may be fetched from besides the remote
   */
  constructor(auth, settings = {}) {
    this.username = auth.username
    this.password = auth.password
    this.origin = settings.origin
    this.restrictUrls = !!settings.restrictUrls
    this.allowedHosts = settings.allowedHosts || []
  }

  /**
   * Parses a url the remote sent and decides whether it may be fetched at all.
   * @param {string} url
   * @returns {URL}
   * @throws {Error} for a protocol other than http(s), or a foreign host when the urls are restricted
   */
  checkUrl(url) {
    const target = new URL(url)
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new Error(`Refusing to fetch ${target.protocol} urls`)
    }
    if (this.restrictUrls && this.origin && target.origin !== this.origin && !this.allowedHosts.includes(target.host)) {
      throw new Error(`Refusing to fetch from ${target.host}: it is not the remote cms and not in allowedHosts`)
    }
    return target
  }

  setAuth(jwtToken) {
    // the token goes in the header the REST API reads (x-access-token), not in the cookie of the remote: that cookie is named after
    // the remote's own `mid`, which is not known here
    this.auth = jwtToken
    this.basicAuth = 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
  }

  addAuthToRequest(options, url) {
    // credentials belong to the remote cms: a url in a record must never receive them
    if (this.auth && (!this.origin || !url || new URL(url).origin === this.origin)) {
      _.set(options, ['headers', 'x-access-token'], this.auth)
      _.set(options, 'headers.Authorization', this.basicAuth)
    }
  }

  async handleRequest (url, options) {
    try {
      const returnJson = _.get(options, 'returnJson', false)
      if (returnJson) {
        delete options.returnJson
      }
      const contentType = options.body instanceof FormData ? false : 'application/json'
      if (!(options.body instanceof FormData)) {
        options.headers = {
          'Accept': 'application/json',
          'Content-Type': contentType
        }
      }
      this.addAuthToRequest(options, url)
      if (_.get(options.headers, 'Content-Type', false) === 'application/json' && _.get(options, 'body', false) && _.isObject(options.body)) {
        options.body = JSON.stringify(options.body)
      }
      const response = await fetch(url, options)
      if (!returnJson) {
        if (!response.ok) {
          throw response
        }
        return response
      }
      let json = null
      try {
        json = await response.json()
      } catch (error) {
        console.error('Failed to parse JSON response:', error)
      }
      const code = _.get(json, 'code', _.get(response, 'status', 0))
      if (code === 0 && !response.ok) {
        throw response
      } else if (code < 200 || code > 299) {
        throw json
      }
      return json
    } catch (error) {
      console.error(`Request to ${options.method} ${url} failed`, error)
      throw error
    }
  }

  async get (url, returnJson = true) {
    return await this.handleRequest(url, {method: 'GET', returnJson})
  }

  async getAttachment(url, outputPath, maxRetries = 10) {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36'
      }
    }
    this.checkUrl(url)
    this.addAuthToRequest(options, url)
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        await fs.ensureDir(path.dirname(outputPath))
        const fileStream = fs.createWriteStream(outputPath)
        const written = new Promise((resolve, reject) => {
          fileStream.on('finish', resolve)
          fileStream.on('error', reject)
        })
        await response.body.pipeTo(
          new WritableStream({
            // wait for each chunk to be flushed: a large file must not pile up in memory
            write(chunk) {
              return new Promise((resolve, reject) => fileStream.write(chunk, error => error ? reject(error) : resolve()))
            },
            close() {
              fileStream.end()
            },
            abort() {
              fileStream.destroy()
            }
          })
        )
        // the file is complete on disk only once the stream reported finish
        await written
        // downloaded: without this the loop fetched the file again on every remaining attempt
        return
      } catch (error) {
        console.error(`Attempt ${url} - ${i + 1} failed:`, error)
        if (i === maxRetries - 1) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  async post (url, body = {}, returnJson = true) {
    return await this.handleRequest(url, {method: 'POST', body, returnJson})
  }

  async put (url, body = {}, returnJson = true) {
    return await this.handleRequest(url, {method: 'PUT', body, returnJson})
  }

  async delete (url, body = {}, returnJson = true) {
    return await this.handleRequest(url, {method: 'DELETE', body, returnJson})
  }
}

exports = module.exports = RequestService
