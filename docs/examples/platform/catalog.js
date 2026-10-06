// What the platform reads of the CMS, and the one rule about who may read it. The routes and the files both ask here, so that a page and its diagram can never follow two rules.
//
// The CMS is read with `cms.api()`: the rights of the server, nothing is checked for a visitor. What a visitor may have is decided by `canRead`, below.
const _ = require('lodash')

/** The first parts of an address that are the platform's own: a product with one of these as its slug could never be reached, so a hook refuses it (see `guardNames`). */
const RESERVED = ['login', 'logout', 'account', 'search', 'support', 'figures', 'pdf', 'platform.css', 'robots.txt', 'favicon.ico']

/** The text of a record in English (a localised field holds one text for each language). */
const text = (record, field) => _.get(record, [field, 'enUS'], '')

/**
 * The one rule. A visitor reads what is public; a signed-in member reads everything that is published. A product that is for members hides all of its versions and pages,
 * a page that is for members hides its text, its diagram and its PDF (its title and summary stay, so that the visitor knows what is behind the sign-in).
 * @param {object|null} member the signed-in member, if any
 * @param {object} product
 * @param {object} [page]
 * @returns {boolean}
 */
const canRead = (member, product, page) => Boolean(member) || !(product.membersOnly || (page && page.membersOnly))

/**
 * @param {object} cms
 * @param {function} [api] where the records are read: `cms.api()`, or the `api` that a route of the PageHelper is given, which notes the resources a kept page was made of
 * @returns {object} the reads of the platform
 */
function catalog (cms, api = cms.api()) {
  const products = () => api('products')
  const versions = () => api('versions')
  const pages = () => api('pages')
  const byOrder = (list, ...keys) => _.sortBy(list, ['order', ...keys])

  const reads = {
    /** @returns {Promise<Array<object>>} the published products, in order */
    products: async () => byOrder(await products().list({ published: true }), 'name.enUS'),

    /** @returns {Promise<object|null>} the published product of that address */
    product: (slug) => products().find({ slug: String(slug), published: true }),

    /** @returns {Promise<Array<object>>} the published versions of a product, in order */
    versions: async (product) => byOrder(await versions().list({ product: product._id, published: true }), 'slug'),

    /** @returns {Promise<object|null>} the published version of a product, by its address */
    version: (product, slug) => versions().find({ product: product._id, slug: String(slug), published: true }),

    /** @returns {Promise<object|null>} the version `latest` stands for: the current one, or the first when none is marked */
    current: async (product) => {
      const all = byOrder(await versions().list({ product: product._id, published: true }), 'slug')
      return _.find(all, 'current') || all[0] || null
    },

    /** @returns {Promise<object|null>} the published page of a version, by its address */
    page: (version, slug) => pages().find({ version: version._id, slug: String(slug), published: true }),

    /** @returns {Promise<Array<object>>} the published pages of a version, in order */
    pages: async (version) => byOrder(await pages().list({ version: version._id, published: true }), 'title.enUS'),

    /**
     * What a request names: the product, then its version, then its page. It stops at the first part that is not there.
     * @param {{product: string, version?: string, page?: string}} params
     * @returns {Promise<{product?: object, version?: object, page?: object}>}
     */
    resolve: async (params) => {
      const found = {}
      found.product = await reads.product(params.product)
      if (!found.product || params.version === undefined) {
        return found
      }
      found.version = await reads.version(found.product, params.version)
      if (!found.version || params.page === undefined) {
        return found
      }
      found.page = await reads.page(found.version, params.page)
      return found
    }
  }
  return reads
}

/**
 * Hooks that keep the addresses of the platform for the platform: a product cannot be called `login`, nor a version `latest`.
 * @param {object} cms
 */
function guardNames (cms) {
  const refuse = (what, bad) => (context) => {
    const slug = _.get(context, 'params.object.slug')
    return typeof slug === 'string' && bad(slug.toLowerCase())
      ? context.error({ code: 400, message: `"${slug}" is an address of the platform: ${what}` })
      : context.next()
  }
  for (const event of ['create', 'update']) {
    cms.api()('products').before(event, refuse('choose another slug for the product', (slug) => RESERVED.includes(slug)))
    cms.api()('versions').before(event, refuse('"latest" always goes to the current version', (slug) => slug === 'latest'))
  }
}

module.exports = catalog
module.exports.canRead = canRead
module.exports.guardNames = guardNames
module.exports.text = text
module.exports.RESERVED = RESERVED
