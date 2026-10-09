const { PassThrough } = require('stream')
const { expect } = require('chai')
const { confirm } = require('../../lib/util/confirm')

// the terminal of the test: what is typed goes in, what is printed comes out
const terminal = () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let printed = ''
  output.on('data', chunk => { printed += chunk })
  return { input, output, printed: () => printed }
}

describe('confirm (the yes or no of cms-import and cms-import-remote)', () => {
  it('is true for yes, in any case and with spaces around it', async () => {
    for (const typed of ['yes', 'YES', 'Yes', '  yes  ']) {
      const { input, output } = terminal()
      const answer = confirm('Sure? [yes/no]', { input, output })
      input.write(`${typed}\n`)
      expect(await answer, typed).to.equal(true)
    }
  })

  it('is false for no, in any case', async () => {
    for (const typed of ['no', 'NO', ' No ']) {
      const { input, output } = terminal()
      const answer = confirm('Sure? [yes/no]', { input, output })
      input.write(`${typed}\n`)
      expect(await answer, typed).to.equal(false)
    }
  })

  it('asks the question, and asks again for anything that is not a whole yes or no', async () => {
    const { input, output, printed } = terminal()
    const answer = confirm('Import now? [yes/no]', { input, output })
    input.write('y\n')
    input.write('maybe\n')
    input.write('yes please\n')
    input.write('yes\n')
    expect(await answer).to.equal(true)
    expect(printed()).to.contain('Import now? [yes/no]')
    expect(printed().match(/yes \/ no\n/g)).to.have.length(3)
  })

  it('is false, and does not hang, when the input ends before an answer (a closed pipe, Ctrl+D)', async () => {
    const { input, output } = terminal()
    const answer = confirm('Sure? [yes/no]', { input, output })
    input.end()
    expect(await answer).to.equal(false)
  })

  it('is false when the input ends after a wrong answer', async () => {
    const { input, output } = terminal()
    const answer = confirm('Sure? [yes/no]', { input, output })
    input.write('what\n')
    input.end()
    expect(await answer).to.equal(false)
  })
})
