#!/usr/bin/env node

// Asks a running CMS to push or pull the resources it syncs (see lib/util/syncCli.js, and docs/operations/SYNC.md)
const { main } = require('../lib/util/syncCli')

main(process.argv.slice(2), process.env).then((code) => {
  process.exitCode = code
}, (error) => {
  console.error(`cms-sync: ${error.message}`)
  process.exitCode = 3
})
