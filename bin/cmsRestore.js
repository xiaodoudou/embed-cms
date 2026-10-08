#!/usr/bin/env node

// Puts a backup made by cms-backup back (see lib/util/backupCli.js, and docs/operations/BACKUP.md)
const { restore } = require('../lib/util/backupCli')
const { explain } = require('../lib/util/loadCli')

// an error the store throws on its own, after restore has its promise (a data folder that another process holds): said in a line, with the exit code 3
const stop = (error) => {
  console.error(`cms-restore: ${explain(error)}`)
  process.exit(3)
}
process.on('uncaughtException', stop)
process.on('unhandledRejection', stop)

restore(process.argv.slice(2)).then((code) => {
  process.exitCode = code
  // the stores are closed: what keeps the process alive after that (timers of the CMS) must not
  setTimeout(() => process.exit(code), 100).unref()
})
