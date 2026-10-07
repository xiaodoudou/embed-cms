const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, execFileSync } = require('child_process')
const { expect } = require('chai')
const { check, checkRange, TYPES, MAX_TITLE } = require('../../scripts/commitlint')

const SCRIPT = path.resolve(__dirname, '../../scripts/commitlint.js')

describe('commit messages (Conventional Commits 1.0.0)', () => {
  describe('the title', () => {
    it('accepts a type and a description', () => {
      for (const type of TYPES) {
        expect(check(`${type}: do the thing`).ok, type).to.equal(true)
      }
    })

    it('accepts a scope, a breaking change mark, and both', () => {
      expect(check('fix(admin): keep Tab inside the omnibar switcher').ok).to.equal(true)
      expect(check('feat!: drop the legacy security profile').ok).to.equal(true)
      expect(check('feat(security)!: turn every protection on by default').ok).to.equal(true)
      expect(check('fix(api/rest): answer 400 for a bad query').ok).to.equal(true)
      expect(check('chore(release): 3.0.5').ok).to.equal(true)
    })

    it('refuses a title that has no type', () => {
      const result = check('Uploads without a file extension keep their type')
      expect(result.ok).to.equal(false)
      expect(result.errors[0]).to.include('<type>(<scope>): <description>')
    })

    it('refuses a type that is not one of the list, and a type written in capitals', () => {
      expect(check('feature: add a thing').ok).to.equal(false)
      expect(check('Fix: add a thing').ok).to.equal(false)
      expect(check('wip: half a thing').errors[0]).to.include('wip')
    })

    it('refuses a missing space or description, an empty scope, and a final period', () => {
      expect(check('fix:no space').ok).to.equal(false)
      expect(check('fix: ').ok).to.equal(false)
      expect(check('fix(): empty scope').ok).to.equal(false)
      expect(check('fix(Admin): capitals in the scope').ok).to.equal(false)
      const period = check('fix: stop the crash.')
      expect(period.ok).to.equal(false)
      expect(period.errors[0]).to.include('period')
    })

    it(`refuses a title of more than ${MAX_TITLE} characters, and says where the detail goes`, () => {
      const title = `fix: ${'a'.repeat(MAX_TITLE)}`
      const result = check(title)
      expect(result.ok).to.equal(false)
      expect(result.errors.join(' ')).to.include('body')
      expect(check(`fix: ${'a'.repeat(MAX_TITLE - 5)}`).ok).to.equal(true)
    })

    it('refuses an empty message, and one with nothing but comments', () => {
      expect(check('').ok).to.equal(false)
      expect(check('# Please enter the commit message\n# lines starting with # are ignored\n').errors[0]).to.include('empty')
    })
  })

  describe('the body and the footers', () => {
    it('wants a blank line between the title and the body', () => {
      expect(check('fix: stop the crash\nit crashed when the list was empty').ok).to.equal(false)
      expect(check('fix: stop the crash\n\nIt crashed when the list was empty.').ok).to.equal(true)
    })

    it('accepts footers and a BREAKING CHANGE footer', () => {
      const message = 'feat(api): rename the query option\n\nThe old name was misleading.\n\nBREAKING CHANGE: the option is called filter now.\nRefs: #12\n'
      expect(check(message).ok).to.equal(true)
    })

    it('ignores the comment lines git adds to a message that is being edited', () => {
      expect(check('fix: stop the crash\n\n# Please enter the commit message\n# On branch dev\n').ok).to.equal(true)
    })

    it('reads a message with Windows line ends', () => {
      expect(check('fix: stop the crash\r\n\r\nIt crashed.\r\n').ok).to.equal(true)
    })
  })

  describe('what git writes by itself', () => {
    it('lets a merge, a revert and the commits of an autosquash through', () => {
      expect(check('Merge branch "dev" into main').ok).to.equal(true)
      expect(check('Revert "feat: add a thing"').ok).to.equal(true)
      expect(check('fixup! fix(admin): keep Tab inside the omnibar switcher').ok).to.equal(true)
      expect(check('squash! feat: add a thing').ok).to.equal(true)
    })
  })

  describe('the command', () => {
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

    it('checks a message file, as the commit-msg hook passes it', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commitlint-'))
      try {
        const good = path.join(dir, 'good')
        const bad = path.join(dir, 'bad')
        fs.writeFileSync(good, 'fix(admin): keep Tab inside the omnibar switcher\n')
        fs.writeFileSync(bad, 'Keep Tab inside the omnibar switcher\n')
        expect(run(good).status).to.equal(0)
        const refused = run(bad)
        expect(refused.status).to.equal(1)
        expect(refused.stderr).to.include('Conventional Commits')
        expect(refused.stderr).to.include('Keep Tab inside the omnibar switcher')
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('checks a title alone, for the title of a pull request', () => {
      expect(run('--title', 'chore(release): 3.0.5').status).to.equal(0)
      expect(run('--title', 'Release 3.0.5').status).to.equal(1)
      expect(run('--title', '').status).to.equal(1)
    })

    it('says how it is used when it is given nothing', () => {
      const result = run()
      expect(result.status).to.equal(2)
      expect(result.stderr).to.include('usage')
    })

    it('has a hook that runs it, and the hook is how git is told to run it in a clone', () => {
      const hook = fs.readFileSync(path.resolve(__dirname, '../../.githooks/commit-msg'), 'utf8')
      expect(hook).to.match(/^#!\/bin\/sh/)
      expect(hook).to.include('scripts/commitlint.js')
      expect(fs.readFileSync(path.resolve(__dirname, '../../scripts/prepare.js'), 'utf8')).to.include('\'core.hooksPath\', \'.githooks\'')
    })
  })

  describe('a range of commits', () => {
    let repo
    before(() => {
      repo = fs.mkdtempSync(path.join(os.tmpdir(), 'commitlint-repo-'))
      const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
      git('init', '-q')
      git('config', 'user.email', 'test@example.com')
      git('config', 'user.name', 'Test')
      git('config', 'commit.gpgsign', 'false')
      git('commit', '-q', '--allow-empty', '-m', 'anything goes before the range')
      for (const message of ['feat(a): good one', 'Not a conventional title', 'fix: good two\n\nWith a body.', 'x: unknown type']) {
        git('commit', '-q', '--allow-empty', '-m', message)
      }
    })
    after(() => {
      fs.rmSync(repo, { recursive: true, force: true })
    })

    it('names every commit that fails, and only those', () => {
      const cwd = process.cwd()
      process.chdir(repo)
      try {
        const failures = checkRange('HEAD~4..HEAD')
        expect(failures.map((item) => item.title)).to.deep.equal(['x: unknown type', 'Not a conventional title'])
        expect(checkRange('HEAD~1..HEAD')).to.have.length(1)
        expect(checkRange('HEAD~4..HEAD~2').map((item) => item.title)).to.deep.equal(['Not a conventional title'])
      } finally {
        process.chdir(cwd)
      }
    })

    it('exits with 1 from the command when a commit fails, and with 0 when none does', () => {
      const run = (range) => spawnSync(process.execPath, [SCRIPT, '--range', range], { cwd: repo, encoding: 'utf8' })
      const failed = run('HEAD~4..HEAD')
      expect(failed.status).to.equal(1)
      expect(failed.stderr).to.include('Not a conventional title')
      expect(run('HEAD~4..HEAD~3').status).to.equal(0)
    })
  })
})
