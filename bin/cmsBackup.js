#!/usr/bin/env node

// Takes a copy of a site, from its data folder or over its REST API (see lib/util/backupCli.js, and docs/operations/BACKUP.md)
const { backup } = require('../lib/util/backupCli')

backup(process.argv.slice(2)).then((code) => {
  process.exitCode = code
})
