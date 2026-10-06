// The feed and the sitemap of the magazine: XML written by hand. What goes into a text is escaped (`_.escape` turns & < > " ' into entities, which XML reads too).
const _ = require('lodash')

const xml = _.escape

/**
 * @param {object} options
 * @param {string} options.baseUrl `https://example.com`, with no slash at the end
 * @param {object} options.language `{ code, tag }`
 * @param {object} options.site the settings record
 * @param {function(object, string): string} options.text the text of a record in the language
 * @param {Array<object>} options.articles the newest first
 * @returns {string} an RSS 2.0 feed of the articles in one language
 */
function rss ({ baseUrl, language, site, text, articles }) {
  const items = articles.slice(0, 20).map((article) => {
    const link = `${baseUrl}/${language.code}/articles/${article.slug}`
    const date = new Date(article.publishedOn || article._createdAt).toUTCString()
    return `    <item>
      <title>${xml(text(article, 'title'))}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <pubDate>${date}</pubDate>
      <description>${xml(text(article, 'summary'))}</description>
    </item>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(text(site, 'name'))}</title>
    <link>${xml(`${baseUrl}/${language.code}`)}</link>
    <description>${xml(text(site, 'tagline'))}</description>
    <language>${language.tag}</language>
${items.join('\n')}
  </channel>
</rss>
`
}

/**
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {Array<object>} options.languages
 * @param {Array<object>} options.articles
 * @param {Array<object>} options.categories
 * @returns {string} a sitemap: the home page, each category and each article, in each language
 */
function sitemap ({ baseUrl, languages, articles, categories }) {
  const entry = (pathname, date) => `  <url><loc>${xml(baseUrl + pathname)}</loc>${date ? `<lastmod>${new Date(date).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`
  const urls = []
  for (const { code } of languages) {
    urls.push(entry(`/${code}`))
    categories.forEach((category) => urls.push(entry(`/${code}/category/${category.slug}`, category._updatedAt)))
    articles.forEach((article) => urls.push(entry(`/${code}/articles/${article.slug}`, article._updatedAt)))
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}

module.exports = { rss, sitemap, xml }
