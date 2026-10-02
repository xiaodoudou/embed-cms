const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { expect } = require('chai')
const { GoogleSpreadsheet } = require('google-spreadsheet')
const { JWT } = require('google-auth-library')

// The Google Sheets import cannot be run against Google here. What broke it once is how the installed google-spreadsheet is
// driven (version 3 authenticated with doc.useServiceAccountAuth, later versions take the auth client in the constructor),
// so this checks the installed library against the way the plugin uses it.

describe('import plugin: Google Sheets access (unit)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../lib/plugins/import/index.js'), 'utf8')

  it('no longer calls useServiceAccountAuth', () => {
    expect(source).to.not.match(/\.useServiceAccountAuth\(/)
  })

  it('hands the auth client to the constructor', () => {
    expect(source).to.match(/new GoogleSpreadsheet\(this\.config\.gsheetId, jwtClient\)/)
  })

  it('works with the installed google-spreadsheet: auth in the constructor, no service account method', () => {
    const auth = new JWT({ email: 'reader@example.iam.gserviceaccount.com', key: 'not-a-real-key', scopes: ['https://www.googleapis.com/auth/drive'] })
    const doc = new GoogleSpreadsheet('sheet-id', auth)
    expect(doc.spreadsheetId).to.equal('sheet-id')
    expect(doc.useServiceAccountAuth).to.equal(undefined)
    expect(doc.loadInfo).to.be.a('function')
  })
})

describe('cms-import command: Google Sheets access and options (unit)', () => {
  const root = path.join(__dirname, '../..')
  const source = fs.readFileSync(path.join(root, 'bin', 'cmsImport.js'), 'utf8')

  it('no longer calls useServiceAccountAuth', () => {
    expect(source).to.not.match(/\.useServiceAccountAuth\(/)
  })

  it('hands the auth client to the constructor, like the plugin', () => {
    expect(source).to.match(/new GoogleSpreadsheet\(this\.config\.gsheetId, jwtClient\)/)
  })

  it('describes -c differently from -s', () => {
    const help = execFileSync(process.execPath, [path.join(root, 'bin', 'cmsImport.js'), '--help'], { encoding: 'utf8' })
    const describeFlag = flag => help.split('\n').find(line => line.includes(flag)).replace(/^\s*-\w,\s*--\w+\s*/, '').trim()
    expect(describeFlag('--createFolders')).to.not.equal(describeFlag('--skip'))
  })
})
