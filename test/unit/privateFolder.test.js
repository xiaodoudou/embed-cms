const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect } = require('chai')
const { ensurePrivateFolder } = require('../../lib/util/privateFolder')

const mode = (folder) => fs.statSync(folder).mode & 0o777

describe('ensurePrivateFolder (the folder of the sessions)', () => {
  let scratch
  beforeEach(function () {
    if (process.platform === 'win32') {
      // Windows has no owner, group and others on a folder: there is nothing to check
      this.skip()
    }
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'private-folder-'))
  })
  afterEach(() => scratch && fs.rmSync(scratch, { recursive: true, force: true }))

  it('makes a folder that only its owner can enter, and the folders above it that are missing', () => {
    const previous = process.umask(0o022)
    try {
      const folder = path.join(scratch, 'data', '.sessions.json')
      ensurePrivateFolder(folder)
      expect(mode(folder)).to.equal(0o700)
    } finally {
      process.umask(previous)
    }
  })

  it('tightens a folder that an earlier version made with the permissions of the umask', () => {
    const folder = path.join(scratch, '.sessions.json')
    fs.mkdirSync(folder, { mode: 0o755 })
    fs.chmodSync(folder, 0o755)
    fs.writeFileSync(path.join(folder, 'abc.json'), '{}')
    ensurePrivateFolder(folder)
    expect(mode(folder)).to.equal(0o700)
    // what is in it stays
    expect(fs.readFileSync(path.join(folder, 'abc.json'), 'utf8')).to.equal('{}')
  })

  it('can be called again on a folder that is already private', () => {
    const folder = path.join(scratch, 's')
    ensurePrivateFolder(folder)
    ensurePrivateFolder(folder)
    expect(mode(folder)).to.equal(0o700)
  })
})
