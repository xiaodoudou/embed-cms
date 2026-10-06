// The magazine: the CMS (the admin for the editors, the API for the pictures) and the public site in one Express application.
//
//   node server.js    then open http://localhost:3000 (the site) and http://localhost:3000/admin (the editors)
//
// The first start fills the CMS from content.json and files/ (ContentLoader); the next ones find everything in place and change nothing.
const path = require('path')
const express = require('express')
const CMS = require('../../../')
const magazine = require('./magazine')

const PORT = Number(process.env.PORT) || 3000
// where the data of the CMS and the kept pages are put: this folder, unless STATE_DIR says another (a test, a second copy)
const STATE = process.env.STATE_DIR || __dirname

const cms = new CMS({
  mid: 'webnode1',
  resources: path.join(__dirname, 'resources'),
  data: path.join(STATE, 'data'),
  // what a visitor's browser may read over /api: the pictures of the pages come from there. Nothing else is open, and nothing can be written.
  anonymousRead: ['settings', 'authors', 'categories', 'articles']
})

const app = express()
// the CMS first (/admin, /api); the pages after it, so that they do not take its addresses
app.use(cms.express())
app.use(magazine(cms))

const server = app.listen(PORT, async () => {
  await cms.bootstrap(server)
  const report = await new CMS.ContentLoader(cms).load(path.join(__dirname, 'content.json'))
  console.log(`The magazine is at http://localhost:${PORT} (content: ${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged)`)
})
