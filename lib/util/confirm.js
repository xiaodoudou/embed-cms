// Asks a yes or no question in the terminal (what cms-import and cms-import-remote ask before they write). Anything but a whole "yes" or "no" asks again, and a
// closed input (a pipe that ended, Ctrl+D) is a "no": nothing is written when nobody answered.
const readline = require('readline')

/**
 * @param {string} question what is asked, with the choices written in it ("... [yes/no]")
 * @param {{input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream}} [streams] the terminal, unless a test gives its own
 * @returns {Promise<boolean>} true for "yes" (any case), false for "no" and for an input that closed
 */
async function confirm (question, { input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output })
  rl.setPrompt(`${question} `)
  rl.prompt()
  try {
    // the lines are read as a stream, so none is lost when several arrive before the next question
    for await (const line of rl) {
      const text = line.trim().toLowerCase()
      if (text === 'yes' || text === 'no') {
        return text === 'yes'
      }
      output.write('yes / no\n')
      rl.prompt()
    }
    return false
  } finally {
    rl.close()
  }
}

module.exports = { confirm }
