// The pages of the example site: the stylesheet, the templates, the routes, and the 404 and error pages. server.js mounts them next to the CMS.
const path = require('path')
const express = require('express')
const _ = require('lodash')
const CMS = require('../../../')

const PER_PAGE = 5

/** What a template shows of an article: its title in English and the day it was made, ready for the template (Mustache cannot compute them) */
const present = (article) => ({
  slug: article.slug,
  name: _.get(article, 'title.enUS', article.slug),
  day: new Date(article._createdAt).toISOString().slice(0, 10),
  body: _.get(article, 'body.enUS', '')
})

/**
 * @param {object} cms the CMS the content comes from
 * @param {object} [options]
 * @param {string|false} [options.cache] where the finished pages are kept: a folder, nothing for the memory, false for nowhere
 * @param {string} [options.views] the folder of the templates (this one's `views` by default)
 * @param {object} [options.pages] more options for the helper
 * @returns {{router: import('express').Router, pages: CMS.PageHelper}}
 */
module.exports = function site (cms, { cache, views = path.join(__dirname, 'views'), pages: more = {} } = {}) {
  const view = (file) => path.join(views, file)
  const pages = new CMS.PageHelper({
    cms,
    cache,
    templates: {
      header: view('header.html'),
      footer: view('footer.html'),
      card: view('card.html'),
      home: view('home.html'),
      articles: view('articles.html'),
      article: view('article.html'),
      notfound: view('notfound.html'),
      error: view('error.html')
    },
    notFound: 'notfound',
    error: 'error',
    locals: { siteName: 'My blog' },
    ...more
  })

  const router = express.Router()

  // the stylesheet: a file of public/, served as it is
  router.use(express.static(path.join(__dirname, 'public')))

  router.get('/', pages.route('home', async ({ api }) => {
    const articles = await api('articles').list({ published: true })
    return { title: 'Latest', articles: _.orderBy(articles, '_createdAt', 'desc').slice(0, 10).map(present) }
  }))

  // /articles?page=1: the page is part of what is kept, so each page of the list is made once
  router.get('/articles', pages.route('articles', async ({ api, query }) => {
    const page = Math.max(0, parseInt(query.page, 10) || 0)
    const articles = await api('articles').list({ published: true }, { page, limit: PER_PAGE })
    const older = await api('articles').list({ published: true }, { page: page + 1, limit: PER_PAGE })
    // (a section is skipped for 0, so page 0 needs a flag of its own)
    return { title: 'All articles', articles: articles.map(present), hasPrevious: page > 0, previous: page - 1, hasNext: older.length > 0, next: page + 1 }
  }, { vary: ['page'] }))

  router.get('/articles/:slug', pages.route('article', async ({ api, params, notFound }) => {
    const article = await api('articles').find({ slug: params.slug, published: true })
    return article ? { title: _.get(article, 'title.enUS', article.slug), article: present(article) } : notFound()
  }))

  // last: a URL no route answered, then whatever a route threw
  router.use(pages.notFoundHandler())
  router.use(pages.errorHandler())

  return { router, pages }
}
