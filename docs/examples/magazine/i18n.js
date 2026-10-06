// The words of the pages, and what a language is: the address says `en` or `zh`, the records say `enUS` or `zhCN`.
const LANGUAGES = [
  { code: 'en', locale: 'enUS', tag: 'en', name: 'English' },
  { code: 'zh', locale: 'zhCN', tag: 'zh-CN', name: '中文' }
]

const WORDS = {
  en: {
    home: 'Home',
    latest: 'Latest',
    featured: 'Featured',
    readMore: 'Read more',
    by: 'By',
    articlesBy: 'Articles by',
    related: 'More to read',
    search: 'Search',
    searchPlaceholder: 'Search the articles',
    searchFor: 'Results for',
    noResults: 'Nothing matches that search.',
    noArticles: 'No articles here yet.',
    newer: 'Newer',
    older: 'Older',
    page: 'Page',
    of: 'of',
    pageEnd: '',
    notFound: 'Page not found',
    notFoundText: 'There is nothing at this address.',
    error: 'Something went wrong',
    errorText: 'We could not show this page. Try again in a moment.',
    backHome: 'Back to the home page',
    subscribe: 'Subscribe with RSS'
  },
  zh: {
    home: '首页',
    latest: '最新文章',
    featured: '精选',
    readMore: '阅读全文',
    by: '作者：',
    articlesBy: '作者的文章：',
    related: '更多阅读',
    search: '搜索',
    searchPlaceholder: '搜索文章',
    searchFor: '搜索结果：',
    noResults: '没有符合搜索条件的内容。',
    noArticles: '这里还没有文章。',
    newer: '较新',
    older: '较早',
    page: '第',
    of: '页，共',
    pageEnd: ' 页',
    notFound: '找不到页面',
    notFoundText: '这个地址上没有内容。',
    error: '出了点问题',
    errorText: '无法显示这个页面，请稍后再试。',
    backHome: '返回首页',
    subscribe: '通过 RSS 订阅'
  }
}

/**
 * @param {string} code `en` or `zh`
 * @returns {object|undefined} the language
 */
const language = (code) => LANGUAGES.find((item) => item.code === code)

module.exports = { LANGUAGES, WORDS, language }
