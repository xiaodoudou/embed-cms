// The magazine: the CMS (the admin for the editors, the API for the pictures) and the public site in one Express application.
//
//   node server.js    then open http://localhost:3000 (the site) and http://localhost:3000/admin (the editors)
//
// The first start fills the CMS from content.json and files/ (ContentLoader); the next ones find everything in place and change nothing.
const path = require('path')
const express = require('express')
const CMS = require('../../../')
const magazine = require('./magazine')

const cms = new CMS({
  mid: 'webnode1',
  resources: path.join(__dirname, 'resources'),
  data: path.join(__dirname, 'data'),
  // what a visitor's browser may read over /api: the pictures of the pages come from there. Nothing else is open, and nothing can be written.
  anonymousRead: ['settings', 'authors', 'categories', 'articles']
})

const app = express()
// the CMS first (/admin, /api); the pages after it, so that they do not take its addresses
app.use(cms.express())
app.use(magazine(cms))

const server = app.listen(3000, async () => {
  await cms.bootstrap(server)
  const report = await new CMS.ContentLoader(cms).load(path.join(__dirname, 'content.json'))
  console.log(`The magazine is at http://localhost:3000 (content: ${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged)`)
})
