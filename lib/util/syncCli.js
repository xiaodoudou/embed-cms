// The cms-sync command (bin/cmsSync.js): asks a running CMS to push or pull the resources it syncs, and waits to say how it went.
// It talks to the sync routes over HTTP with the token of that CMS, so it works from another machine and while the CMS is running.

const USAGE = `Usage: cms-sync <push|pull> [resource ...] [options]

Asks a CMS to sync its resources with the other CMS of its Sync settings, one after the other, and says how each went.
  push   this CMS writes to the other one
  pull   the other CMS writes to this one
  resource ...   only these (they have to be among the resources to sync); all of them when left out

Options:
  --url <address>   the CMS to ask (default: $EMBED_CMS_URL, else http://localhost:9990)
  --token <token>   the "Token" under "This CMS" in its Sync settings (default: $EMBED_CMS_SYNC_TOKEN, which keeps it out of the process list)
  --no-wait         start the run and return, without waiting for it to end
  -h, --help        this text

Exit code: 0 when every resource is done, 1 when one failed, 2 for a wrong command, 3 when the CMS did not start the run.`

const POLL_MS = 1000

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Reads the arguments of the command.
 * @param {string[]} argv what follows `cms-sync`
 * @param {object} env the environment
 * @returns {{help?: boolean, direction?: string, resources: string[], url: string, token: string, wait: boolean, error?: string}}
 */
function parseArguments (argv, env = {}) {
  const parsed = { resources: [], url: env.EMBED_CMS_URL || 'http://localhost:9990', token: env.EMBED_CMS_SYNC_TOKEN || '', wait: true }
  const positional = []
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '-h' || arg === '--help') {
      return { ...parsed, help: true }
    } else if (arg === '--no-wait') {
      parsed.wait = false
    } else if (arg === '--url' || arg === '--token') {
      const value = argv[++index]
      if (value === undefined || value.startsWith('--')) {
        return { ...parsed, error: `${arg} needs a value` }
      }
      parsed[arg.slice(2)] = value
    } else if (arg.startsWith('--url=') || arg.startsWith('--token=')) {
      const [name, ...rest] = arg.slice(2).split('=')
      parsed[name] = rest.join('=')
    } else if (arg.startsWith('-')) {
      return { ...parsed, error: `unknown option ${arg}` }
    } else {
      positional.push(arg)
    }
  }
  const [direction, ...resources] = positional
  if (direction !== 'push' && direction !== 'pull') {
    return { ...parsed, error: direction ? `"${direction}" is not push or pull` : 'say push or pull' }
  }
  if (!parsed.token) {
    return { ...parsed, error: 'a token is needed: --token, or EMBED_CMS_SYNC_TOKEN' }
  }
  return { ...parsed, direction, resources, url: parsed.url.replace(/\/+$/, '') }
}

const describe = (result) => {
  if (result.status === 'error') {
    return `error: ${result.error}`
  }
  const files = Number.isFinite(result.attachmentsAdded) ? `, attachments added ${result.attachmentsAdded || 0}, removed ${result.attachmentsRemoved || 0}` : ''
  return `done, created ${result.created || 0}, updated ${result.updated || 0}, removed ${result.removed || 0}${files}`
}

/**
 * Runs the command.
 * @param {string[]} argv what follows `cms-sync`
 * @param {object} [env]
 * @param {{out: function(string), err: function(string)}} [io] where the lines go
 * @param {object} [options]
 * @param {number} [options.pollMs] how often to ask how the run goes
 * @returns {Promise<number>} the exit code
 */
async function main (argv, env = {}, io = { out: console.log, err: console.error }, { pollMs = POLL_MS } = {}) {
  const args = parseArguments(argv, env)
  if (args.help) {
    io.out(USAGE)
    return 0
  }
  if (args.error) {
    io.err(`cms-sync: ${args.error}\n\n${USAGE}`)
    return 2
  }
  const query = `token=${encodeURIComponent(args.token)}`
  const call = async (path, method = 'GET') => {
    try {
      const response = await fetch(`${args.url}/sync/${path}${path.includes('?') ? '&' : '?'}${query}`, { method })
      let body
      try {
        body = await response.json()
      } catch {
        body = {}
      }
      return { status: response.status, ok: response.ok, body }
    } catch (error) {
      throw new Error(`${args.url} could not be reached (${(error.cause && (error.cause.code || error.cause.message)) || error.message})`, { cause: error })
    }
  }

  let started
  try {
    const names = args.resources.length > 0 ? `?resources=${encodeURIComponent(args.resources.join(','))}` : ''
    started = await call(`run/${args.direction}${names}`, 'POST')
  } catch (error) {
    io.err(`cms-sync: ${error.message}`)
    return 3
  }
  if (!started.ok) {
    io.err(`cms-sync: the CMS did not start the ${args.direction}: ${started.body.error || started.body.message || started.status}`)
    return 3
  }
  io.out(`${args.direction}: ${started.body.resources.join(', ') || 'no resource'}`)
  if (!args.wait) {
    return 0
  }

  // the results are said as they come, once each
  const said = new Set()
  for (;;) {
    let state
    try {
      state = await call('runs')
    } catch (error) {
      io.err(`cms-sync: ${error.message}`)
      return 3
    }
    if (!state.ok) {
      io.err(`cms-sync: the CMS refused to say how it goes: ${state.body.error || state.status}`)
      return 3
    }
    const run = (state.body.running && state.body.running.startedAt === started.body.startedAt)
      ? state.body.running
      : (state.body.last && state.body.last.startedAt === started.body.startedAt ? state.body.last : null)
    for (const result of (run && run.results) || []) {
      if (!said.has(result.resource)) {
        said.add(result.resource)
        io.out(`  ${result.resource}: ${describe(result)}`)
      }
    }
    if (run && run.finishedAt) {
      return run.results.some(result => result.status === 'error') || run.results.length < run.resources.length ? 1 : 0
    }
    if (!run && !state.body.running) {
      // the run is gone (the CMS restarted, or another run took its place)
      io.err('cms-sync: the CMS no longer knows this run')
      return 3
    }
    await sleep(pollMs)
  }
}

module.exports = { main, parseArguments, USAGE }
