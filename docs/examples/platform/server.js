// The docs platform: two servers in one process.
//
//   node server.js
//     http://localhost:3000        the site, for everyone: it has no route of the CMS, so /admin and /api are not found there
//     http://127.0.0.1:3001/admin  the CMS, for the editors: it listens on this machine only
//
// The first start fills the CMS from content.json and files/ (ContentLoader), and makes one member to sign in with (the address and the password are printed).
const crypto = require('crypto')
const path = require('path')
const express = require('express')
const CMS = require('../../../')
const platform = require('./platform')

const PUBLIC_PORT = Number(process.env.PORT) || 3000
const ADMIN_PORT = Number(process.env.ADMIN_PORT) || 3001

// No `anonymousRead`: nothing of the CMS is open to a visitor. Whoever reaches the admin port has to sign in.
const cms = new CMS({ mid: 'webnode1', resources: path.join(__dirname, 'resources'), data: path.join(__dirname, 'data') })

// the CMS has its own application, on its own port, on this machine only: a proxy that publishes the site does not publish this
const admin = express()
admin.use(cms.express())
const adminServer = admin.listen(ADMIN_PORT, '127.0.0.1', async () => {
  await cms.bootstrap(adminServer)

  await new CMS.ContentLoader(cms).load(path.join(__dirname, 'content.json'))

  // the site first: it puts a hook on the members that turns a password into a hash, and the member below must pass through it
  const { app } = platform(cms, { secret: process.env.SESSION_SECRET, cache: path.join(__dirname, '.page-cache') })

  // a member to try the site with: made when there is none, with a password of its own that is shown once
  const members = cms.api()('members')
  if (!(await members.list({}, { limit: 1 })).length) {
    const password = crypto.randomBytes(6).toString('hex')
    await members.create({ name: 'Ada Reader', email: 'ada@example.com', password, active: true })
    console.log(`A member to sign in with: ada@example.com / ${password}`)
  }

  app.listen(PUBLIC_PORT, () => {
    console.log(`Docshelf is at http://localhost:${PUBLIC_PORT}, the admin at http://127.0.0.1:${ADMIN_PORT}/admin`)
  })
})
