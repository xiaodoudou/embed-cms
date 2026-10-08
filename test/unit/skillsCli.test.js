const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect } = require('chai')
const { main, parseArguments, shipped } = require('../../lib/util/skillsCli')

const capture = () => {
  const lines = { out: [], err: [] }
  return { lines, io: { out: (text) => lines.out.push(text), err: (text) => lines.err.push(text) } }
}

describe('cms-skills command (unit)', () => {
  let dir
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-skills-')) })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('ships skills whose name is their folder, in the format of the Agent Skills standard', () => {
    const names = shipped()
    expect(names.length).to.be.greaterThan(0)
    for (const name of names) {
      expect(name).to.match(/^[a-z0-9]+(-[a-z0-9]+)*$/).and.have.length.below(65)
      const head = fs.readFileSync(path.join(__dirname, '..', '..', 'skills', name, 'SKILL.md'), 'utf8').split('---')[1]
      expect(head).to.match(new RegExp(`^\\s*name: ${name}\\s*$`, 'm'))
      const description = /^description: (.+)$/m.exec(head)
      expect(description, `${name} has a description`).to.not.equal(null)
      expect(description[1].length).to.be.within(1, 1024)
    }
  })

  it('reads the options and refuses what it does not know', () => {
    expect(parseArguments(['--claude', '--agents', '--to', 'x', '--user', '--force', '--list'])).to.deep.equal({
      folders: ['.claude/skills', '.agents/skills'], targets: ['x'], user: true, force: true, list: true
    })
    expect(parseArguments(['--to']).error).to.match(/needs a folder/)
    expect(parseArguments(['--nope']).error).to.match(/unknown option/)
  })

  it('installs into .agents/skills by default and keeps what is there', () => {
    const { lines, io } = capture()
    expect(main([], { cwd: dir, ...io })).to.equal(0)
    for (const name of shipped()) {
      expect(fs.existsSync(path.join(dir, '.agents', 'skills', name, 'SKILL.md'))).to.equal(true)
    }
    const first = path.join(dir, '.agents', 'skills', shipped()[0], 'SKILL.md')
    fs.writeFileSync(first, 'mine')
    expect(main([], { cwd: dir, ...io })).to.equal(0)
    expect(fs.readFileSync(first, 'utf8')).to.equal('mine')
    expect(lines.out.join('\n')).to.match(/kept \(already there/)
    expect(main(['--force'], { cwd: dir, ...io })).to.equal(0)
    expect(fs.readFileSync(first, 'utf8')).to.not.equal('mine')
  })

  it('installs into the folder of Claude Code, of the user, or of your choice', () => {
    const { io } = capture()
    const home = path.join(dir, 'home')
    expect(main(['--claude', '--user'], { cwd: dir, home, ...io })).to.equal(0)
    expect(fs.existsSync(path.join(home, '.claude', 'skills', shipped()[0], 'SKILL.md'))).to.equal(true)
    expect(fs.existsSync(path.join(dir, '.agents'))).to.equal(false)
    expect(main(['--to', 'elsewhere/skills'], { cwd: dir, ...io })).to.equal(0)
    expect(fs.existsSync(path.join(dir, 'elsewhere', 'skills', shipped()[0], 'SKILL.md'))).to.equal(true)
  })

  it('copies nothing with --list, and answers 2 to a wrong command', () => {
    const { lines, io } = capture()
    expect(main(['--list'], { cwd: dir, ...io })).to.equal(0)
    expect(fs.existsSync(path.join(dir, '.agents'))).to.equal(false)
    expect(lines.out[0]).to.match(/^would be installed/)
    expect(main(['--bogus'], { cwd: dir, ...io })).to.equal(2)
    expect(lines.err[0]).to.match(/unknown option --bogus/)
  })
})
