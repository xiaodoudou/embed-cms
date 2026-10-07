#!/usr/bin/env node
// Checks commit messages against Conventional Commits 1.0.0 (https://www.conventionalcommits.org/en/v1.0.0/):
//
//   <type>[(scope)][!]: <description>
//
//   [body]
//
//   [footers]
//
// It is the one check behind the commit-msg hook (.githooks/commit-msg), the commit step of CI and the title of a release pull request:
//   node scripts/commitlint.js <file>           the message in a file, as git passes it to the commit-msg hook
//   node scripts/commitlint.js --range a..b     every commit of a range, on its own
//   node scripts/commitlint.js --title "text"   a title alone (the title of a pull request)
const fs = require('fs')
const { execFileSync } = require('child_process')

const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
const MAX_TITLE = 100
const HEADER = /^([a-z]+)(?:\(([a-z0-9][a-z0-9._/-]*)\))?(!)?: (\S.*)$/
// what git writes by itself, and what a rebase leaves for autosquash
const GENERATED = /^(Merge |Revert "|fixup! |squash! |amend! )/

/**
 * Checks one commit message.
 * @param {string} message the whole message, comment lines of git included
 * @returns {{ok: boolean, errors: string[]}}
 */
function check (message) {
  const lines = String(message).replace(/\r\n/g, '\n').split('\n').filter((line) => !line.startsWith('#'))
  while (lines.length && lines[0].trim() === '') {
    lines.shift()
  }
  const title = lines[0] || ''
  if (!title) {
    return { ok: false, errors: ['the message is empty'] }
  }
  if (GENERATED.test(title)) {
    return { ok: true, errors: [] }
  }
  const errors = []
  const match = HEADER.exec(title)
  if (!match) {
    errors.push(`the title must be "<type>(<scope>): <description>", with a type of ${TYPES.join(', ')}`)
  } else {
    if (!TYPES.includes(match[1])) {
      errors.push(`the type "${match[1]}" is not one of ${TYPES.join(', ')}`)
    }
    if (/\.$/.test(match[4])) {
      errors.push('the description does not end with a period')
    }
  }
  if (title.length > MAX_TITLE) {
    errors.push(`the title is ${title.length} characters, the most is ${MAX_TITLE}: put the detail in the body`)
  }
  if (lines.length > 1 && lines[1].trim() !== '') {
    errors.push('a blank line separates the title from the body')
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Checks every commit of a range, each on its own.
 * @param {string} range for example "origin/dev..HEAD"
 * @returns {Array<{commit: string, title: string, errors: string[]}>} the commits that fail
 */
function checkRange (range) {
  const separator = '\u0001'
  const log = execFileSync('git', ['log', '--format=%H%x00%B%x01', range], { encoding: 'utf8' })
  return log.split(separator).map((entry) => entry.replace(/^\n/, '')).filter(Boolean).flatMap((entry) => {
    const [commit, message] = entry.split('\u0000')
    const result = check(message)
    return result.ok ? [] : [{ commit: commit.slice(0, 8), title: message.split('\n')[0], errors: result.errors }]
  })
}

/** Prints what is wrong and how the title is written. */
function report (failures) {
  for (const { label, errors } of failures) {
    console.error(`  ${label}`)
    errors.forEach((error) => console.error(`    - ${error}`))
  }
  console.error('\nThe commit messages follow Conventional Commits: type(scope): description, for example')
  console.error('  fix(admin): keep Tab inside the omnibar switcher')
  console.error('  feat(fields)!: rename the url option of the image field')
  console.error('See CONTRIBUTING.md, "Commit messages".')
}

function main (argv) {
  if (argv[0] === '--range') {
    const failures = checkRange(argv[1])
    if (failures.length) {
      report(failures.map((item) => ({ label: `${item.commit} ${item.title}`, errors: item.errors })))
      return 1
    }
    return 0
  }
  if (argv[0] === '--title') {
    const result = check(argv[1] || '')
    if (!result.ok) {
      report([{ label: argv[1] || '(empty)', errors: result.errors }])
    }
    return result.ok ? 0 : 1
  }
  if (!argv[0]) {
    console.error('usage: commitlint.js <message file> | --range <a..b> | --title <text>')
    return 2
  }
  const message = fs.readFileSync(argv[0], 'utf8')
  const result = check(message)
  if (!result.ok) {
    report([{ label: message.split('\n')[0] || '(empty)', errors: result.errors }])
  }
  return result.ok ? 0 : 1
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)))
}

module.exports = { check, checkRange, TYPES, MAX_TITLE }
