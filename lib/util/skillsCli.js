// The cms-skills command (bin/cmsSkills.js): copies the agent skills that ship with embed-cms (the skills/ folder, see skills/README.md) into the skills folder of a project or of the user.
const fs = require('fs')
const os = require('os')
const path = require('path')

const SKILLS = path.resolve(__dirname, '..', '..', 'skills')
// the folders agents read skills from: the cross-client one of the Agent Skills convention, and the one of Claude Code
const FOLDERS = { agents: '.agents/skills', claude: '.claude/skills' }

const USAGE = `Usage: cms-skills [options]

Copies the embed-cms skills (create a site, model, add, patch and load content, back up, sync, go to production) into the skills folder of an agent.
By default they go to ./.agents/skills, the folder the Agent Skills convention shares between agents.

Options:
  --claude         install into .claude/skills (Claude Code)
  --agents         install into .agents/skills (the default when no folder is named)
  --to <folder>    install into this skills folder (can be repeated)
  --user           use your home folder instead of the current folder for --claude and --agents
  --force          replace a skill that is already installed (the default keeps it)
  --list           say what would be installed, and where; copy nothing
  -h, --help       this text

Exit code: 0 when it is done, 2 for a wrong command, 3 when a copy failed.`

/**
 * @param {string[]} argv what follows `cms-skills`
 * @returns {{help?: boolean, folders: string[], targets: string[], user: boolean, force: boolean, list: boolean, error?: string}}
 */
function parseArguments (argv) {
  const parsed = { folders: [], targets: [], user: false, force: false, list: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '-h' || arg === '--help') {
      return { ...parsed, help: true }
    } else if (arg === '--claude' || arg === '--agents') {
      parsed.folders.push(FOLDERS[arg.slice(2)])
    } else if (arg === '--user') {
      parsed.user = true
    } else if (arg === '--force') {
      parsed.force = true
    } else if (arg === '--list') {
      parsed.list = true
    } else if (arg === '--to') {
      const value = argv[++index]
      if (!value) {
        return { ...parsed, error: '--to needs a folder' }
      }
      parsed.targets.push(value)
    } else {
      return { ...parsed, error: `unknown option ${arg}` }
    }
  }
  return parsed
}

/** @returns {string[]} the names of the skills that ship with embed-cms */
function shipped () {
  return fs.readdirSync(SKILLS, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(SKILLS, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
}

/**
 * @param {string[]} argv
 * @param {{cwd?: string, home?: string, out?: (text: string) => void, err?: (text: string) => void}} [io]
 * @returns {number} the exit code
 */
function main (argv, { cwd = process.cwd(), home = os.homedir(), out = console.log, err = console.error } = {}) {
  const options = parseArguments(argv)
  if (options.help) {
    out(USAGE)
    return 0
  }
  if (options.error) {
    err(`cms-skills: ${options.error}. See cms-skills --help`)
    return 2
  }
  const base = options.user ? home : cwd
  const folders = options.folders.length || options.targets.length ? options.folders : [FOLDERS.agents]
  const destinations = [...folders.map(folder => path.join(base, folder)), ...options.targets.map(target => path.resolve(cwd, target))]
  const names = shipped()
  try {
    for (const destination of destinations) {
      for (const name of names) {
        const target = path.join(destination, name)
        const exists = fs.existsSync(target)
        const verb = exists && !options.force ? 'kept (already there, --force replaces it)' : exists ? 'replaced' : 'installed'
        out(`${options.list ? 'would be ' : ''}${verb}: ${target}`)
        if (!options.list && (!exists || options.force)) {
          fs.rmSync(target, { recursive: true, force: true })
          fs.cpSync(path.join(SKILLS, name), target, { recursive: true })
        }
      }
    }
  } catch (error) {
    err(`cms-skills: ${error.message}`)
    return 3
  }
  return 0
}

module.exports = { main, parseArguments, shipped }
