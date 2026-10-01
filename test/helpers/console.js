// The import commands talk to the person running them through console (what they upload, who they log in as, a request
// that failed). A test that runs them on purpose keeps that out of the results: call muteConsole() in beforeEach and
// the function it returns in afterEach.
function muteConsole () {
  const saved = { log: console.log, warn: console.warn, error: console.error }
  console.log = console.warn = console.error = () => {}
  return () => Object.assign(console, saved)
}

module.exports = { muteConsole }
