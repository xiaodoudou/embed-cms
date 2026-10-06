// The cms-load command (bin/cmsLoad.js): puts the content and the files of a JSON file into the CMS of the project (see lib/ContentLoader.js and docs/operations/CONTENT_LOADER.md).
// It starts the CMS itself, loads, and stops: the server of the project must not be running, two processes cannot share the data folder.
const USAGE = `Usage: cms-load <content.json> [options]

Puts the content and the files of a JSON file into the CMS of this project (its cms.json and its data folder), then stops. Stop the server first.
  content.json   a list of records for each resource; "authors://mei-lin" is a relation, "attachment://files/cover.jpg" a file (relative to the JSON file)

Options:
  --dry-run                  check everything and say what would change; nothing is written
  --config <file>            the cms.json of the project (default: ./cms.json)
  --key <resource>=<field>   the field that names a record of a resource when it is not its first unique field (can be repeated)
  --loose                    keep a field the resource does not declare, instead of reporting it
  -q, --quiet                only the summary
  -h, --help                 this text

Exit code: 0 when it is done, 1 when the content has problems (they are listed, nothing was written), 2 for a wrong command, 3 when the CMS could not be started or a write failed.`

/**
 * @param {string[]} argv what follows `cms-load`
 * @returns {{help?: boolean, file?: string, dryRun: boolean, config?: string, keys: Object<string, string>, strict: boolean, quiet: boolean, error?: string}}
 */
function parseArguments (argv) {
  const parsed = { dryRun: false, keys: {}, strict: true, quiet: false }
  const positional = []
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '-h' || arg === '--help') {
      return { ...parsed, help: true }
    } else if (arg === '--dry-run') {
      parsed.dryRun = true
    } else if (arg === '--loose') {
      parsed.strict = false
    } else if (arg === '-q' || arg === '--quiet') {
      parsed.quiet = true
    } else if (arg === '--config' || arg === '--key') {
      const value = argv[++index]
      if (!value) {
        return { ...parsed, error: `${arg} needs a value` }
      }
      if (arg === '--config') {
        parsed.config = value
      } else if (/^[^=]+=[^=]+$/.test(value)) {
        const [resource, field] = value.split('=')
        parsed.keys[resource] = field
      } else {
        return { ...parsed, error: '--key is <resource>=<field>, for instance --key articles=slug' }
      }
    } else if (arg.startsWith('-')) {
      return { ...parsed, error: `Unknown option ${arg}` }
    } else {
      positional.push(arg)
    }
  }
  if (positional.length !== 1) {
    return { ...parsed, error: positional.length === 0 ? 'Give the JSON file to load' : 'Give one JSON file' }
  }
  return { ...parsed, file: positional[0] }
}

/**
 * What to tell a person about an error that stopped the command. A data folder that another process holds (the server of the project) is the one that happens: the store says so
 * with a long error and a stack, which is not what anybody wants to read.
 * @param {Error} error
 * @returns {string}
 */
function explain (error) {
  const cause = error && error.cause
  const locked = [error, cause].some((item) => item && item.code === 'LEVEL_LOCKED') || /LOCK/.test(String((cause && cause.message) || ''))
  if (locked || (error && error.code === 'LEVEL_DATABASE_NOT_OPEN')) {
    return 'the data folder is in use by another process. Is the server of the project running? Stop it first: two processes cannot share the data folder.'
  }
  return String((error && error.message) || error)
}

/** Starts the CMS of the project with its own configuration, and gives how to stop it */
async function startCms (options) {
  const CMS = require('../../')
  const cms = new CMS(options)
  await cms.bootstrap()
  return { cms, close: () => cms._closeDatabase() }
}

/**
 * @param {string[]} argv what follows `cms-load`
 * @param {object} [deps]
 * @param {function(string): void} [deps.out] where the report goes
 * @param {function(string): void} [deps.err] where the problems go
 * @param {function(object): Promise<{cms: object, close: function(): Promise<void>}>} [deps.start] starts the CMS (replaced in tests)
 * @returns {Promise<number>} the exit code
 */
async function main (argv, { out = console.log, err = console.error, start = startCms } = {}) {
  const args = parseArguments(argv)
  if (args.help) {
    out(USAGE)
    return 0
  }
  if (args.error) {
    err(`cms-load: ${args.error}\n\n${USAGE}`)
    return 2
  }
  const ContentLoader = require('../ContentLoader')
  let started
  try {
    started = await start(args.config ? { config: args.config } : {})
  } catch (error) {
    err(`cms-load: the CMS could not be started: ${explain(error)}\nIs the server of the project running? Stop it first: two processes cannot share the data folder.`)
    return 3
  }
  try {
    const report = await new ContentLoader(started.cms).load(args.file, { dryRun: args.dryRun, keys: args.keys, strict: args.strict, log: args.quiet ? undefined : out })
    const { created, updated, unchanged, files } = report
    out(`${args.dryRun ? 'Would have' : 'Done:'} ${created} created, ${updated} updated, ${unchanged} unchanged; files: ${files.added} added, ${files.removed} removed, ${files.unchanged} unchanged.${args.dryRun ? ' Nothing was written.' : ''}`)
    return 0
  } catch (error) {
    if (error.name === 'ContentError') {
      err(`cms-load: ${error.message}\nNothing was written.`)
      return 1
    }
    err(`cms-load: ${error.message}`)
    return 3
  } finally {
    await started.close()
  }
}

module.exports = { main, parseArguments, explain, USAGE }
