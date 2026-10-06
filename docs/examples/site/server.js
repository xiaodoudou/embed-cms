// The example site: the CMS and the public pages in one Express application. Run it from this folder with `node server.js`, then open http://localhost:3000
// The first start fills the CMS with the four articles of content.json (ContentLoader); the next ones change nothing.
const path = require('path')
const express = require('express')
const CMS = require('../../../')
const site = require('./site')

const cms = new CMS({ mid: 'webnode1', resources: path.join(__dirname, 'resources'), data: path.join(__dirname, 'data'), anonymousRead: ['articles'] })
const app = express()

// the CMS first: /admin, /api and the files it serves; then the pages
app.use(cms.express())
app.use(site(cms, { cache: path.join(__dirname, '.page-cache') }).router)

const server = app.listen(3000, async () => {
  await cms.bootstrap(server)
  await new CMS.ContentLoader(cms).load(path.join(__dirname, 'content.json'))
})
