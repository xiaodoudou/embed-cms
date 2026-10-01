#!/usr/bin/env node
// Moves the content of a CMS from one local storage engine to another: node scripts/migrate-store.js --help
const path = require('path')
const { migrateStore } = require('../lib/util/migrateStore')

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

if (args.includes('--help') || !option('from') || !option('to')) {
  console.log(`Usage: node scripts/migrate-store.js --from <engine> --to <engine> [--data ./data] [--dry-run]

Copies every resource from one local engine to another: jsondown, sqlite or leveldb. Stop the CMS first.
The old files stay where they are. Afterwards set "dbEngine": { "type": "<engine>" } in cms.json.`)
  process.exit(args.includes('--help') ? 0 : 1)
}

migrateStore({
  data: path.resolve(option('data') || './data'),
  from: option('from'),
  to: option('to'),
  dryRun: args.includes('--dry-run'),
  log: console.log
}).then(({ stores, entries, skipped }) => {
  console.log(`${stores} stores, ${entries} entries${skipped.length ? `, ${skipped.length} skipped` : ''}`)
}, (error) => {
  console.error(error.message)
  process.exit(1)
})
