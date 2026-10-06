#!/usr/bin/env node

// Puts the content and the files of a JSON file into the CMS of the project (see lib/util/loadCli.js, and docs/operations/CONTENT_LOADER.md)
const { main, explain } = require('../lib/util/loadCli')

// an error the store throws on its own, after main has its promise (a data folder that another process holds): said in a line, with the exit code 3
const stop = (error) => {
  console.error(`cms-load: ${explain(error)}`)
  process.exit(3)
}
process.on('uncaughtException', stop)
process.on('unhandledRejection', stop)

// (main answers every failure with an exit code: what it does not know goes to stop, above)
main(process.argv.slice(2)).then((code) => {
  process.exitCode = code
  // the stores are closed: what keeps the process alive after that (timers of the CMS) must not
  setTimeout(() => process.exit(code), 100).unref()
})
