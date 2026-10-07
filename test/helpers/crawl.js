// Visits a site the way a visitor does: from some addresses, then every address that its pages link to (links, pictures, stylesheets), and reports what is wrong. Used by the tests of the examples.
const request = require('supertest')

const ATTRIBUTE = /\b(href|src|action)="([^"]*)"/g
const SRCSET = /\bsrcset="([^"]*)"/g
const BROKEN_TEXT = /\[object Object\]|\bundefined\b|\bNaN\b/

/** @returns {string} an attribute of a page as the address it holds (the page escapes `&` and quotes) */
const decode = (value) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x2F;/g, '/').replace(/&#39;|&#x27;/g, '\'').trim()

/**
 * @param {string} link what a page holds
 * @param {string} from the address of the page
 * @returns {string|null} the path and the query of a link inside the site, or null for anything else (another site, an anchor, a mail address, a script)
 */
function inside (link, from) {
  const clean = decode(link)
  if (!clean || clean.startsWith('#') || clean.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(clean)) {
    return null
  }
  const url = new URL(clean, `http://site.test${from}`)
  return url.pathname + url.search
}

/** supertest opens a port for each request: a dropped first packet (see docs/contributing/TESTING.md) is tried again */
async function fetchWithRetry (client, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.get(url)
    } catch (error) {
      if (attempt >= 3) {
        throw error
      }
    }
  }
}

/**
 * @param {import('http').Server|import('express').Express} site a site that is listening, or an application
 * @param {Array<string>} starts where the visit begins
 * @param {object} [options]
 * @param {Array<number>} [options.allowedStatuses] the statuses that are not a fault (a redirect is followed, and is not one either)
 * @param {object} [options.client] a supertest agent that keeps cookies, to visit as someone who is signed in
 * @param {Array<RegExp>} [options.skip] addresses that are not visited (the admin of a CMS that is mounted with the site)
 * @param {number} [options.limit] how many addresses at most
 * @returns {Promise<{pages: Array<{url: string, status: number, type: string}>, problems: Array<string>}>}
 */
async function crawl (site, starts, { allowedStatuses = [200], client = request(site), skip = [/^\/admin(\/|$)/, /^\/logout/], limit = 400 } = {}) {
  const seen = new Map()
  const asImage = new Set()
  const queue = [...starts]
  const problems = []
  const pages = []
  while (queue.length && seen.size < limit) {
    const url = queue.shift()
    if (seen.has(url) || skip.some((pattern) => pattern.test(url))) {
      continue
    }
    const res = await fetchWithRetry(client, url)
    const type = String(res.headers['content-type'] || '').split(';')[0]
    seen.set(url, res.status)
    pages.push({ url, status: res.status, type })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const target = inside(res.headers.location || '', url)
      if (target === null) {
        problems.push(`${url}: redirects outside the site, to ${res.headers.location}`)
      } else {
        queue.push(target)
      }
      continue
    }
    if (!allowedStatuses.includes(res.status)) {
      problems.push(`${url}: answered ${res.status}`)
      continue
    }
    if (asImage.has(url) && !/^image\//.test(type)) {
      problems.push(`${url}: used as a picture, and is ${type}`)
    }
    if (type !== 'text/html') {
      continue
    }
    const html = res.text
    if (!/^<!doctype html>/i.test(html.trim())) {
      problems.push(`${url}: is not a page (no doctype)`)
    }
    if (!/<title>[^<]+<\/title>/.test(html)) {
      problems.push(`${url}: has no title`)
    }
    if (!/<html lang="[a-zA-Z-]+"/.test(html)) {
      problems.push(`${url}: has no language`)
    }
    // what a template prints when something is missing is a fault of the page, not of the content
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
    const text = (visible.match(BROKEN_TEXT) || [])[0]
    if (text) {
      problems.push(`${url}: shows "${text}"`)
    }
    if (res.status === 401 && !/Sign in/.test(html)) {
      problems.push(`${url}: refuses a visitor and does not say how to sign in`)
    }
    for (const [, attribute, value] of html.matchAll(ATTRIBUTE)) {
      const target = inside(value, url)
      if (target !== null) {
        if (attribute === 'src') {
          asImage.add(target)
        }
        queue.push(target)
      }
    }
    for (const [, value] of html.matchAll(SRCSET)) {
      for (const candidate of decode(value).split(',')) {
        const target = inside(candidate.trim().split(/\s+/)[0], url)
        if (target !== null) {
          asImage.add(target)
          queue.push(target)
        }
      }
    }
  }
  return { pages, problems }
}

module.exports = { crawl, inside }
