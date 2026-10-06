// What the magazine reads from the CMS, in one place: the routes ask for an article, a list or a search, and do not know how it is read.
//
// It uses the JavaScript API (`cms.api()`), which runs with the rights of your server: nothing here checks a user, so the filters (`published: true`) are the rules of the site.
const _ = require('lodash')

const EVENTS = ['create', 'update', 'remove', 'createAttachment', 'updateAttachment', 'removeAttachment']
const RESOURCES = ['settings', 'authors', 'categories', 'articles']

/**
 * The newest first: by the day an article was published, then by when it was made (a resource has no sort: it is done here).
 * @param {Array<object>} list
 * @returns {Array<object>}
 */
const newestFirst = (list) => _.orderBy(list, [(article) => article.publishedOn || article._createdAt, '_createdAt'], ['desc', 'desc'])

/**
 * @param {object} cms
 * @returns {object} the reads of the site
 */
module.exports = function content (cms) {
  const api = cms.api()
  // `articles` follows the relations: the author and the categories of an article come back as records, not as ids
  const articles = api('articles', 'authors', 'categories')
  const authors = api('authors')
  const categories = api('categories')
  const settings = api('settings')

  // What is read most (the menu, the list of everything published) is kept until a record of the site changes: a hook on each resource empties it.
  const kept = new Map()
  const remember = (key, load) => {
    if (!kept.has(key)) {
      kept.set(key, load().catch((error) => {
        kept.delete(key)
        throw error
      }))
    }
    return kept.get(key)
  }
  for (const resource of RESOURCES) {
    for (const event of EVENTS) {
      api(resource).after(event, (context) => {
        kept.clear()
        context.next()
      })
    }
  }

  /** @returns {Promise<Array<object>>} every published article, the newest first */
  const published = () => remember('published', async () => newestFirst(await articles.list({ published: true })))

  return {
    /** @returns {Promise<object>} the name and the tagline of the site */
    site: () => remember('site', async () => (await settings.list({}))[0] || {}),

    /** @returns {Promise<Array<object>>} the categories, in the order of the menu */
    categories: () => remember('categories', async () => _.sortBy(await categories.list({}), (category) => (_.isNil(category.order) ? Infinity : category.order))),

    published,

    /**
     * @param {string} slug
     * @returns {Promise<object|undefined>} the published article of that address
     */
    article: async (slug) => _.find(await published(), { slug }),

    /**
     * A query on a relation: the articles whose `categories` hold the id of the category.
     * @param {string} slug of the category
     * @returns {Promise<{category: object, articles: Array<object>}|null>} null when there is no such category
     */
    inCategory: async (slug) => {
      const category = await categories.find({ slug })
      return category ? { category, articles: newestFirst(await articles.list({ published: true, categories: category._id })) } : null
    },

    /**
     * @param {string} slug of the author
     * @returns {Promise<{author: object, articles: Array<object>}|null>} null when there is no such author
     */
    byAuthor: async (slug) => {
      const author = await authors.find({ slug })
      return author ? { author, articles: newestFirst(await articles.list({ published: true, author: author._id })) } : null
    },

    /**
     * What the visitor typed goes into a regular expression: it is escaped first, so `c++` and `(` are letters and not syntax, and it is cut, since the CMS refuses a long pattern.
     * @param {string} term
     * @param {string} locale `enUS` or `zhCN`: the language of the fields that are searched
     * @returns {Promise<Array<object>>}
     */
    search: async (term, locale) => {
      const pattern = _.escapeRegExp(String(term).trim().slice(0, 80))
      if (!pattern) {
        return []
      }
      const match = (field) => ({ [`${field}.${locale}`]: { $regex: pattern, $options: 'i' } })
      return newestFirst(await articles.list({ published: true, $or: [match('title'), match('summary')] }))
    },

    /**
     * @param {object} article
     * @param {number} count
     * @returns {Promise<Array<object>>} other articles of the first category of this one
     */
    related: async (article, count) => {
      const category = _.find(article.categories)
      const all = await published()
      return _.take(_.filter(all, (other) => other._id !== article._id && (!category || _.some(other.categories, { _id: category._id }))), count)
    },

    /**
     * When what a page shows last changed: the latest update of the records, and of the author and the categories followed in them.
     * @param {...Array<object>|object} records
     * @returns {Date}
     */
    modified: (...records) => {
      const dates = _.flattenDeep(records).filter(Boolean).flatMap((record) => [record._updatedAt, _.get(record, 'author._updatedAt'), ..._.map(record.categories, '_updatedAt')])
      return new Date(_.max(_.filter(dates, _.isFinite)) || 0)
    }
  }
}
